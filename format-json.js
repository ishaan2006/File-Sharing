// standalone library, no imports
// formatJSON comes from gh/drizzt536/files/JavaScript/lib.js

export function formatJSON(code="{}", {
	objectNewline     = true,
	tab               = "\t",
	newline           = "\n",
	space             = " ",
	arrayOneLine      = true,
	arrayOneLineSpace = " ", // if " ", [ ITEM ]. if "\t", [\tITEM\t]. etc
}={}) {
	if (typeof code !== "string")
		throw TypeError`formatJSON() requires a string`

	try { JSON.parse(code) }
	catch { throw TypeError`formatJSON() requires a JSON string` }

	if (/^\s*\{\s*\}\s*$/.test(code))
		return "{}"
	if (/^\s*\[\s*\]\s*$/.test(code))
		return "[]"
	if (/^("|'|`)(.|\n)*\1$/.test( code.replace(/\s+/g, "") ))
		return code.replace(/(^\s*)|(\s*$)/g, "")

	for (var i = 0, n = code.length, tabs = 0, output = "", inString = !1; i < n; i++) {
		if (code[i] === '"' && code[i - 1] !== '\\')
			inString = !inString

		if (inString)
			output += code[i]
		else if (/\s/.test(code[i]))
			continue
		else if (code[i] === "{")
			output += `${code[i]}${newline}${tab.repeat(++tabs)}`
		else if (code[i] === "[") {
			if (!arrayOneLine) {
				output += `${code[i]}${newline}${tab.repeat(++tabs)}`
				continue
			}
			for (let arrayInString = !1, index = i + 1 ;; index++) {
				if (code[index] === '"' && code[index - 1] !== '\\')
					arrayInString = !arrayInString
				if (arrayInString) continue
				if (["{", "[", ","].includes(code[index])) {
					output += `${code[i]}${newline}${tab.repeat(++tabs)}`
					break
				} else if (code[index] === "]") {
					output += `[${arrayOneLineSpace}${
						code.substring(i + 1, index)
					}${arrayOneLineSpace}]`
					i = index
					break
				}
			}
		} else if (["}", "]"].includes(code[i]))
			output += `${newline}${tab.repeat(--tabs)}${code[i]}`
		else if (code[i] === ":")
			output += `${code[i]}${space}`
		else if (code[i] === ",") {
			// objectNewline === true : }, {
			// objectNewline === false: },\n\t{
			let s = code.slice(i)
			output += code[i] + (!objectNewline &&
				code[i + 1 + s.length - s.replace(/^\s+/, "").length] === "{" ?
					`${space}` :
					`${newline}${tab.repeat(tabs)}`
			)
		}
		else
			output += code[i]
	}

	return output
}

export function formatAsJSON(object = {}) {
	return formatJSON( JSON.stringify(object) )
}

export function escapeHTML(str, {tabLength = 6}={}) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/ /g, "&nbsp;")
		.replace(/\t/g, "&nbsp;".repeat(tabLength))
		.replace(/\n/g, "<br>")
}

export function formatAsJSONHTML(object = {}) {
	return escapeHTML(
		formatAsJSON(object)
	)
}
