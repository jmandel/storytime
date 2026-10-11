// Page text may mark who is talking: [Frog: "Toad, Toad,"] shouted Frog. Each speaker gets a color (from the
// book's "voices", or a default palette) and a small name label whenever the speaker changes.
const VOICE_COLORS = ['#7bd88f', '#ffb347', '#8ab4ff', '#ff8fb1', '#c8a2ff', '#5fd3d0']

export function SpeakerText({text, voices}) {
  const colors = {...voices}
  let last = null
  return text.split(/(\[[^\]:]+:[^\]]*\])/).map((part, i) => {
    const m = part.match(/^\[([^\]:]+):\s*([^\]]*)\]$/)
    if (!m) return part
    const [, who, said] = m
    colors[who] ??= VOICE_COLORS[Object.keys(colors).length % VOICE_COLORS.length]
    const label = who !== last && <span className="who">{who}</span>
    last = who
    return <span key={i} className="said" style={{color: colors[who]}}>{label}{said}</span>
  })
}
