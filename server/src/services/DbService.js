import { MongoClient } from "mongodb";

let db;
export let meetingsCollection;
export let audioCollection;
export let counters;

export const initDb = async () => {
  if (!process.env.COUNCIL_DB_URL) {
    throw new Error("COUNCIL_DB_URL environment variable not set.");
  }
  const mongoClient = new MongoClient(process.env.COUNCIL_DB_URL);
  
  if (!process.env.COUNCIL_DB_PREFIX) {
    throw new Error("COUNCIL_DB_PREFIX environment variable not set.");
  }
  console.log(`[init] COUNCIL_DB_PREFIX is ${process.env.COUNCIL_DB_PREFIX}`);
  
  db = mongoClient.db(process.env.COUNCIL_DB_PREFIX);
  meetingsCollection = db.collection("meetings");
  audioCollection = db.collection("audio");
  counters = db.collection("counters");

  await initializeCounters();
};

const initializeCounters = async () => {
  try {
    await counters.insertOne({ _id: "meeting_id", seq: 0 });
    console.log("[init] No meeting ID found, created initial meeting #0");
  } catch (e) {
    if (e.errorResponse?.code === 11000) {
      console.log(
        "[init] Meeting ID counter already found in database. Not creating meeting #0"
      );
      return;
    }
    throw e; 
  }
};

export const insertMeeting = async (meeting) => {
  const ret = await counters.findOneAndUpdate(
    { _id: "meeting_id" },
    { $inc: { seq: 1 } }
  );
  meeting._id = ret.seq;
  return await meetingsCollection.insertOne(meeting);
};
