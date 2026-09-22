import mongoose from "mongoose";

/**
 * Opens (or reuses) the MongoDB connection.
 *
 * Serverless invocations reuse a warm module between requests but may run many
 * in parallel, so the connection and the in-flight connection promise are both
 * cached on globalThis. Without that cache every server action would call
 * mongoose.connect() again and pile up connections against the Atlas limit.
 */
declare global {
  // eslint-disable-next-line no-var
  var __mongooseConn:
    | { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
    | undefined;
}

const cached = (global.__mongooseConn ??= { conn: null, promise: null });

const connectToDB = async (): Promise<typeof mongoose> => {
  if (cached.conn) return cached.conn;

  const mongoURL = process.env.MONGO_URL;
  if (!mongoURL) {
    // Thrown rather than logged: callers await this, and a silent return made
    // every downstream query fail with an unrelated-looking error.
    throw new Error(
      "MONGO_URL is not set. Copy app/.env.example to app/.env.local and fill it in."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoURL, { bufferCommands: false })
      .catch((err) => {
        // Let the next call retry instead of caching a rejected promise.
        cached.promise = null;
        throw new Error(`Failed to connect to MongoDB: ${err.message}`);
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
};

export default connectToDB;
