// Burned-in word captions in the style of the reference shorts (see SKILL.md "Captions").
// One spoken word at a time (short function words join the next word), white heavy sans with a black outline,
// centred about two-thirds down the frame over the characters' legs, hard swap on each word, no animation.
// Sizes are at 1080x1920; Remotion's --scale enlarges DOM text with the frame, so the 2K render matches.
// Font: public/fonts/Montserrat-ExtraBold.woff2 (copy of @fontsource/montserrat/files/montserrat-latin-800-normal.woff2).
// Words: public/<name>/words.json, the same file the sound mix uses: [{ "w"|"word"|"text": "...", "s": sec, "e": sec, "emph"?: true }].
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export const CAPTION = {
  font: "CaptionSans",
  fontFile: "fonts/Montserrat-ExtraBold.woff2",
  size: 78,           // px font size at 1080x1920 (text ~4 % of frame height)
  outline: 13,        // px stroke width; half of it shows outside the glyph (~6.5 px edge)
  centerY: 0.67,      // caption centre as a fraction of frame height
  maxWidth: 0.86,     // of frame width; longer groups wrap to two lines
  fill: "#ffffff",
  emphFill: "#FFD23F", // only on words marked "emph": true in words.json (at most one punch word per sentence)
  ink: "#000000",
  joinMaxLetters: 3,  // a word this short joins the next one ("a cannonball", "you were")
  joinMaxGap: 0.25,   // s: only joins when the next word follows within this gap
  groupMaxChars: 14,  // never build a group longer than this
  holdGap: 0.4,       // s: a caption stays up through pauses shorter than this, then clears
  lead: 0,            // frames: show a caption this many frames before its word starts
};

type Word = { w?: string; word?: string; text?: string; s: number; e: number; emph?: boolean };
type Piece = { text: string; emph: boolean };
type Group = { pieces: Piece[]; s: number; e: number };

const clean = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}'’\-]/gu, "").replace(/’/g, "'");

export function groupWords(words: Word[]): Group[] {
  const ws = words
    .map((w) => ({ text: clean(w.w ?? w.word ?? w.text ?? ""), s: +w.s, e: +w.e, emph: !!w.emph }))
    .filter((w) => w.text);
  const out: Group[] = [];
  for (let i = 0; i < ws.length; i++) {
    const g: Group = { pieces: [{ text: ws[i].text, emph: ws[i].emph }], s: ws[i].s, e: ws[i].e };
    while (i + 1 < ws.length) {
      const last = g.pieces[g.pieces.length - 1].text, nxt = ws[i + 1];
      const len = g.pieces.reduce((n, p) => n + p.text.length + 1, 0) + nxt.text.length;
      if (last.length > CAPTION.joinMaxLetters || nxt.s - g.e > CAPTION.joinMaxGap || len > CAPTION.groupMaxChars) break;
      g.pieces.push({ text: nxt.text, emph: nxt.emph });
      g.e = nxt.e;
      i++;
    }
    out.push(g);
  }
  // hold each caption until the next one starts, unless the pause is long
  out.forEach((g, i) => {
    const next = out[i + 1];
    g.e = next && next.s - g.e < CAPTION.holdGap ? next.s : g.e;
  });
  return out;
}

let fontPromise: Promise<void> | null = null;
const loadCaptionFont = () =>
  (fontPromise ??= new FontFace(CAPTION.font, `url(${staticFile(CAPTION.fontFile)}) format("woff2")`, { weight: "800" })
    .load()
    .then((f) => { (document.fonts as unknown as { add(face: FontFace): void }).add(f); }));

/** `src`: staticFile path of words.json, e.g. staticFile("bridge/words.json"). `offset`: seconds of picture before the voice starts. */
export const Captions: React.FC<{ src: string; offset?: number }> = ({ src, offset = 0 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [handle] = useState(() => delayRender("captions: font + words.json"));

  useEffect(() => {
    Promise.all([loadCaptionFont(), fetch(src).then((r) => r.json())])
      .then(([, words]) => { setGroups(groupWords(words as Word[])); continueRender(handle); })
      .catch((err) => { console.error("captions failed to load", err); setGroups([]); continueRender(handle); });
  }, [src, handle]);

  const t = (frame + CAPTION.lead) / fps - offset;
  const g = useMemo(() => groups?.find((x) => t >= x.s && t < x.e), [groups, t]);
  if (!g) return null;

  const k = height / 1920; // compositions other than 1080x1920 keep the same proportions
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute", left: "50%", top: CAPTION.centerY * height, transform: "translate(-50%, -50%)",
          maxWidth: CAPTION.maxWidth * width, textAlign: "center",
          fontFamily: `${CAPTION.font}, "Arial Black", sans-serif`, fontWeight: 800,
          fontSize: CAPTION.size * k, lineHeight: 1.05, letterSpacing: "-0.005em", whiteSpace: "pre-wrap",
          WebkitTextStroke: `${CAPTION.outline * k}px ${CAPTION.ink}`, paintOrder: "stroke fill",
          textShadow: `0 ${3 * k}px ${8 * k}px rgba(0,0,0,0.35)`,
        }}
      >
        {g.pieces.map((p, i) => (
          <span key={i} style={{ color: p.emph ? CAPTION.emphFill : CAPTION.fill }}>{(i ? " " : "") + p.text}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
