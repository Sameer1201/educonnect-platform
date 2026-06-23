import path from "path";
import { fileURLToPath } from "url";
import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(cookieParser());

app.use("/api", router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

const apiErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (!req.path.startsWith("/api")) {
    next(err);
    return;
  }

  logger.error({ err, path: req.path }, "API request failed");
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(500).json({ error: "Internal server error" });
};

app.use(apiErrorHandler);

if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDist = path.resolve(__dirname, "../../edtech/dist/public");
  app.use(express.static(frontendDist));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
