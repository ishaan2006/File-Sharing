import { MongoClient } from "mongodb"
import fs from "fs"

export const url = "mongodb://127.0.0.1:27017/"

// all these functions could be async functions

export function connect() {
	// returns a promise
	return MongoClient.connect(url)
}

export async function add(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const secondary = db.collection("user-keys")
	const entries = Object.entries(element)[0]

	await Promise.all([
		// only use the secondary database if there is a user-friendly id
		entries[1].userFriendlyId == null ||
			secondary.insertOne({
				[entries[1].userFriendlyId]: entries[0]
			}),
		main.insertOne(element)
	])

	client.close()
}
export async function update(element) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const fileDigest = Object.keys(element)[0]

	const query = {
		[fileDigest]: { $exists: true }
	}

	const updates = { [fileDigest]: {
		projectedDeleteTime : element[fileDigest].projectedDeleteTime,
		usesRemaining       : element[fileDigest].usesRemaining,
		originalName        : element[fileDigest].originalName,
	} }

	// you can go up in sensitivity, but not down.
	// this really only affects deletion.
	if (element[fileDigest].sensitive)
		updates[fileDigest].sensitive = true

	await collection.updateOne(query, { $set: updates })

	// the secondary collection shouldn't need to be changed...
	// so we don't need to update it here
	// The file digest is inherant to the identity of the file,
	// and you can't change the user-friendly id

	client.close()
}
export async function get(key) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")

	let ret = await main.findOne({
		[key]: { $exists: true }
	})

	client.close()

	return ret
}
export async function remove(key) {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const secondary = db.collection("user-keys")
	const values = Object.values(await get(key))[0]

	await Promise.all([
		// only remove from the secondary database if it is there
		values.userFriendlyId == null ||
			secondary.deleteOne({
				[values.userFriendlyId]: { $exists: true }
			}),
		fs.existsSync(values.relativeFileLocation) &&
			fs.rm(values.relativeFileLocation),
		main.deleteOne({
			[key]: { $exists: true }
		})
	])

	client.close()
}
export async function getAll() {
	const client = await connect()
	const db = client.db("File-Sharing")
	const main = db.collection("main")
	const docs = await main.find({}).toArray()

	client.close()

	return docs
}
