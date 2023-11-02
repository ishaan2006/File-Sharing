// this is something else
import { extname as _extname } from "path"

export function extname(path) {
	// `path.extname(".dotfile")` returns "" for some reason
	// this fixes that issue

	return _extname("a" + path)
}

export const UPLOAD_DESTINATION = "private/uploads/"

export function pathFromDigest(digest) {
	// return the relative path the associated file

	return UPLOAD_DESTINATION + digest + ".tmp"
}

export function pathFromDbObj(element) {
	return pathFromDigest(element.fileDigest)
}


export default {
	extname,
	pathFromDigest,
	pathFromDbObj,
	UPLOAD_DESTINATION
}
