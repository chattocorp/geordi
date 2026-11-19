const promptTitleLimit = 60;
const graphemes = new Intl.Segmenter();

export function promptTitle(text: string) {
	const line = text.split('\n', 1)[0].trim();
	if (line.length <= promptTitleLimit) return line;
	const cut = graphemes.segment(line).containing(promptTitleLimit - 1)!.index;
	const prefix = line.slice(0, cut);
	const words = /\s/u.test(line[cut]) ? prefix : prefix.replace(/\s+\S*$/u, '');
	return words.trimEnd() + '…';
}
