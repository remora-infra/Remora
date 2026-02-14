import { MongoClient, Db, Collection } from "mongodb";

let db: Db;

export async function connectMongo(): Promise<Db> {
  const client = new MongoClient(process.env.MONGO_URI!);
  await client.connect();

  db = client.db(process.env.DB_NAME);
  console.log("MongoDB connected");

  return db;
}

export function memoryCollection(): Collection {
  if (!db) throw new Error("Mongo not initialized");
  return db.collection("memories");
}
