// Page text may mark who is talking: [Frog: "Toad, Toad,"] shouted Frog. Each speaker's words are shown in their
// color (from the book's "voices", or a default palette), and the speaker's name in the narration ("said Frog",
// "cried a squirrel") gets the same color, so the reader can tell the voices apart at a glance.
const VOICE_COLORS = ['#7bd88f', '#ffb347', '#8ab4ff', '#ff8fb1', '#c8a2ff', '#5fd3d0']
const TAG = /(\[[^\]:]+:[^\]]*\])/

function speakerColors(text, voices) {
  const colors = {...voices}
  for (const part of text.split(TAG)) {
    const who = part.match(/^\[([^\]:]+):/)?.[1]
    if (who) colors[who] ??= VOICE_COLORS[Object.keys(colors).length % VOICE_COLORS.length]
  }
  return colors
}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Narration with each speaker's name (whole word, any case: "Squirrel" also matches "a squirrel") in their color.
function Narration({text, colors}) {
  const names = Object.keys(colors).sort((a, b) => b.length - a.length)
  if (!names.length) return text
  const re = new RegExp(`\\b(${names.map(escape).join('|')})\\b`, 'gi')
  const out = []
  let last = 0
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index))
    const who = names.find(n => n.toLowerCase() === m[0].toLowerCase())
    out.push(<span key={m.index} className="named" style={{color: colors[who]}}>{m[0]}</span>)
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return out
}

export function SpeakerText({text, voices}) {
  const colors = speakerColors(text, voices)
  return text.split(TAG).map((part, i) => {
    const m = part.match(/^\[([^\]:]+):\s*([^\]]*)\]$/)
    if (!m) return <Narration key={i} text={part} colors={colors} />
    return <span key={i} className="said" style={{color: colors[m[1]]}}>{m[2]}</span>
  })
}
