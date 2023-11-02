import * as mongoOps from "./db.js"
import crypto from "crypto"

function bisectRight(arr, x) {
	var lo = 0
	var hi = arr.length

	var mid

	while (lo != hi) {
		mid = lo + (hi - lo >> 1)

		if (arr[mid] <= x)
			lo = mid + 1
		else
			hi = mid
	}

	return lo
}

function randomInt(max, exclusions=[]) {
	// uniform random number in the range [0, max] ...
	// excluding any number in `exclusions` ...
	// assuming `exclusions` is sorted in ascending order

	const effectiveMax = max - exclusions.length - 1

	if (effectiveMax < 0)
		return null

	const randomIndex = crypto.randomInt(effectiveMax + 1)

	var current = randomIndex;

	// this used to be: `exclusions.some(e => e <= current)`,
	// but assuming the list is sorted,
	while (exclusions[0] <= current) {
		var i = bisectRight(exclusions, current)

		exclusions.splice(0, i)

		current += i
	}

	return current
}

function base26DigitMap(c) {
	const code = c.charCodeAt()

	return String.fromCharCode(code + (code < ":".charCodeAt() ?
		49 : 10
	));
}

function base26DigitReverseMap(c) {
	const code = c.charCodeAt()

	return String.fromCharCode(code - (code < "k".charCodeAt() ?
		49 : 10
	));
}

async function databaseIdsOfFormat(idFormat) {
	const
		client     = await mongoOps.connect(),
		db         = client.db("File-Sharing"),
		collection = db.collection("main")

	var values = collection.find({ idFormat })

	// just get the user-friendly Ids
	values = values.map(e => e.userFriendlyId)

	// convert the strings to numbers
	values =
		/^\d\\d$/.test(idFormat) ? values.map(e => parseInt(e, 10)) :
		/^\d\\w$/.test(idFormat) ? values.map(e => parseInt(e, 36)) :
			values.map(e => parseInt(base26DigitReverseMap(e), 26))

	values = await values.toArray()

	client.close()

	return values
}

const mapFns = {
	// id format to random integer on the range
	"4\\d"(exclusionList=[]) {
		const int = randomInt(10**4 - 1, exclusionList)
		return int.toString(10).padStart(4, "0")
	},
	"8\\d"(exclusionList=[]) {
		const int = randomInt(10**8 - 1, exclusionList)
		return int.toString(10).padStart(8, "0")
	},
	"4[A-Z]"(exclusionList=[]) {
		const int = randomInt(26 ** 4 - 1, exclusionList)
		return int.toString(26)
			.padStart(4, "0")
			.split("")
			.map(base26DigitMap)
			.join("")
	},
	"8[A-Z]"(exclusionList=[]) {
		const int = randomInt(26 ** 8 - 1, exclusionList)
		return int.toString(26)
			.padStart(8, "0")
			.split("")
			.map(base26DigitMap)
			.join("")
	},
	"4\\w"(exclusionList=[]) {
		const int = randomInt(36 ** 4 - 1, exclusionList)
		return int.toString(36).padStart(4, "0")
	},
	"8\\w"(exclusionList=[]) {
		const int = randomInt(36 ** 8 - 1, exclusionList)
		return int.toString(36).padStart(8, "0")
	},
}

export default async function nextUserFriendlyId(body) {
	const idFormat = body.idFormat

	return mapFns[idFormat](await databaseIdsOfFormat(idFormat)).toUpperCase()
}
