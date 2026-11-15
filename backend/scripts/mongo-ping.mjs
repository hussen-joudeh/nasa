import { MongoClient } from 'mongodb';
import { resolveMongoDatabase, resolveMongoUri } from '../../scripts/fieldshift-config.mjs';

const uri = resolveMongoUri();
const dbName = resolveMongoDatabase();
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
  await client.db(dbName).command({ ping: 1 });
  console.log(`MongoDB ready: database=${dbName} server=${uri.replace(/\/\/[^@]+@/, '//***@')}`);
} catch (err) {
  console.error(`MongoDB unavailable: ${err?.message ?? err}`);
  process.exit(1);
} finally {
  await client.close();
}