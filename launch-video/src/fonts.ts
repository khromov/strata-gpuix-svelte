import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

/** The app's own faces, from lib/theme.ts: IBM Plex Sans and Lilex. */
const FACES: Array<[family: string, file: string, weight: string]> = [
	['IBM Plex Sans', 'ibm-plex-sans-latin-400-normal.woff2', '400'],
	['IBM Plex Sans', 'ibm-plex-sans-latin-500-normal.woff2', '500'],
	['IBM Plex Sans', 'ibm-plex-sans-latin-600-normal.woff2', '600'],
	['IBM Plex Sans', 'ibm-plex-sans-latin-700-normal.woff2', '700'],
	['Lilex', 'lilex-latin-500-normal.woff2', '500']
];

export function useFonts() {
	const [handle] = useState(() => delayRender('fonts'));
	useEffect(() => {
		Promise.all(
			FACES.map(async ([family, file, weight]) => {
				const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)})`, { weight });
				document.fonts.add(await face.load());
			})
		).then(() => continueRender(handle));
	}, [handle]);
}
