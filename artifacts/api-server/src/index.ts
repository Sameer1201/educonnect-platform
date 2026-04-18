import "./lib/loadEnv";
import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { seedDefaultUsers } from "./seed";
import { createLiveServer, handleUpgrade } from "./live";
import { startDigestScheduler } from "./lib/digestScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
const wss = createLiveServer();

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(wss, req, socket, head);
});

seedDefaultUsers()
  .then(() => {
    server.listen(port, (err?: Error) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
      startDigestScheduler();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to seed default users");
    process.exit(1);
  });
