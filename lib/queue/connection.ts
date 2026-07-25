import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redisConnection: IORedis | undefined;
};

// BullMQ requires maxRetriesPerRequest to be null on the connection it manages.
export const redisConnection =
  globalForRedis.redisConnection ??
  new IORedis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: null,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redisConnection = redisConnection;
}
