import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import { logger } from "./lib/logger";

interface Client {
  ws: WebSocket;
  userId: number;
  name: string;
  role: "teacher" | "student";
  classId: number;
}

interface Poll {
  id: string;
  options: string[];
  votes: number[];
  votedStudents: Set<number>;
  active: boolean;
}

interface Room {
  teacher: Client | null;
  students: Map<number, Client>;
  currentPoll: Poll | null;
}

const rooms = new Map<number, Room>();

function getOrCreateRoom(classId: number): Room {
  if (!rooms.has(classId)) {
    rooms.set(classId, { teacher: null, students: new Map(), currentPoll: null });
  }
  return rooms.get(classId)!;
}

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(data));
    } catch (e) {
      logger.error({ e }, "WS send error");
    }
  }
}

function sendRaw(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(data);
    } catch (e) {
      // ignore frame send errors
    }
  }
}

export function createLiveServer() {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, ctx: { classId: number }) => {
    const { classId } = ctx;
    let client: Client | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === "join") {
          const room = getOrCreateRoom(classId);
          client = { ws, userId: Number(msg.userId), name: String(msg.name), role: msg.role, classId };

          if (msg.role === "teacher") {
            room.teacher = client;
            // Notify all waiting students that teacher arrived
            room.students.forEach((student) => {
              send(student.ws, { type: "teacher-joined" });
            });
            // Send list of already-connected students to teacher
            const studentList = Array.from(room.students.values()).map((s) => ({
              studentId: s.userId,
              name: s.name,
            }));
            send(ws, { type: "room-state", students: studentList, studentCount: room.students.size });
          } else {
            room.students.set(client.userId, client);
            // Tell student whether teacher is present
            send(ws, { type: "room-state", hasTeacher: !!room.teacher });
            // Notify teacher of new student
            if (room.teacher) {
              send(room.teacher.ws, { type: "student-joined", studentId: client.userId, name: client.name });
            }
          }
          return;
        }

        if (!client) return;
        const room = rooms.get(classId);
        if (!room) return;

        // Video frame relay: teacher → all students
        if (msg.type === "video-frame" && client.role === "teacher") {
          const raw2 = JSON.stringify({ type: "video-frame", data: msg.data });
          room.students.forEach((student) => {
            sendRaw(student.ws, raw2);
          });
          return;
        }

        // Audio chunk relay: teacher → all students
        if (msg.type === "audio-chunk" && client.role === "teacher") {
          const raw2 = JSON.stringify({ type: "audio-chunk", data: msg.data });
          room.students.forEach((student) => {
            sendRaw(student.ws, raw2);
          });
          return;
        }

        if (msg.type === "slides-updated") {
          // Teacher broadcasts slide update to all students
          room.students.forEach((student) => {
            send(student.ws, { type: "slides-updated" });
          });
          return;
        }

        // Chat message: relay to ALL participants (teacher + every student)
        if (msg.type === "chat") {
          const chatPayload = JSON.stringify({
            type: "chat",
            senderId: client.userId,
            senderName: client.name,
            senderRole: client.role,
            text: String(msg.text ?? "").slice(0, 500),
            timestamp: Date.now(),
          });
          // Send to all students
          room.students.forEach((student) => sendRaw(student.ws, chatPayload));
          // Send to teacher (even if sender is teacher — confirms delivery)
          if (room.teacher) sendRaw(room.teacher.ws, chatPayload);
          return;
        }

        // ── Poll: teacher creates a poll ──────────────────────────────
        if (msg.type === "poll-create" && client.role === "teacher") {
          const pollId = `poll-${Date.now()}`;
          const options: string[] = (msg.options as string[]).filter((o: string) => o.trim());
          const poll: Poll = {
            id: pollId,
            options,
            votes: new Array(options.length).fill(0),
            votedStudents: new Set(),
            active: true,
          };
          room.currentPoll = poll;
          const payload = { type: "poll-start", pollId, options: poll.options, votes: poll.votes };
          room.students.forEach((s) => send(s.ws, payload));
          send(ws, payload); // echo back to teacher
          return;
        }

        // ── Poll: student votes ─────────────────────────────────────
        if (msg.type === "poll-vote" && client.role === "student") {
          const poll = room.currentPoll;
          if (!poll || !poll.active || poll.id !== msg.pollId) return;
          if (poll.votedStudents.has(client.userId)) return; // no re-vote
          const optIdx = Number(msg.optionIdx);
          if (optIdx < 0 || optIdx >= poll.options.length) return;
          poll.votes[optIdx]++;
          poll.votedStudents.add(client.userId);
          const updatePayload = { type: "poll-update", pollId: poll.id, votes: poll.votes, totalVotes: poll.votedStudents.size };
          room.students.forEach((s) => send(s.ws, updatePayload));
          if (room.teacher) send(room.teacher.ws, updatePayload);
          return;
        }

        // ── Poll: teacher ends poll ─────────────────────────────────
        if (msg.type === "poll-end" && client.role === "teacher") {
          const poll = room.currentPoll;
          if (!poll) return;
          poll.active = false;
          const endPayload = { type: "poll-ended", pollId: poll.id, options: poll.options, votes: poll.votes, totalVotes: poll.votedStudents.size };
          room.students.forEach((s) => send(s.ws, endPayload));
          send(ws, endPayload);
          room.currentPoll = null;
          return;
        }

        // Viewer count request
        if (msg.type === "ping") {
          const r = rooms.get(classId);
          send(ws, { type: "pong", studentCount: r?.students.size ?? 0 });
          return;
        }

      } catch (e) {
        logger.error({ e }, "Error processing WS message");
      }
    });

    ws.on("close", () => {
      if (!client) return;
      const room = rooms.get(classId);
      if (!room) return;

      if (client.role === "teacher") {
        room.teacher = null;
        room.students.forEach((student) => {
          send(student.ws, { type: "teacher-left" });
        });
      } else {
        room.students.delete(client.userId);
        if (room.teacher) {
          send(room.teacher.ws, { type: "student-left", studentId: client.userId });
        }
      }

      if (!room.teacher && room.students.size === 0) {
        rooms.delete(classId);
      }
    });

    ws.on("error", (e) => logger.error({ e }, "WS client error"));
  });

  return wss;
}

export function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: import("stream").Duplex,
  head: Buffer
) {
  const url = req.url ?? "";
  const match = url.match(/\/api\/live\/(\d+)/);
  if (!match) {
    socket.destroy();
    return;
  }
  const classId = parseInt(match[1], 10);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req, { classId });
  });
}
