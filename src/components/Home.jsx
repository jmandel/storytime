// Before a call. Without a family: the welcome screen (start a family, or open a family link). With one: the
// family's name, "Join the call", the family link to share, and the books.
import {useEffect, useState} from 'react'
import {guardHome, useBackLayer} from '../lib/guard.js'
import {Library} from './Library.jsx'
import {useFamilyBooks} from '../lib/library.js'
import {go, shareLink} from '../lib/links.js'
import {FAMILY, ME, familyLink, leaveFamily, setMyName, startFamily} from '../lib/family.js'
import {RECENT, update, useStored, write} from '../lib/store.js'

export function Home() {
  const family = useStored(FAMILY)
  useEffect(guardHome, [])
  return family?.f ? <FamilyHome family={family} /> : <Welcome />
}

function Welcome() {
  const [starting, setStarting] = useState(false)
  const {books} = useFamilyBooks(null)
  useBackLayer(starting, () => setStarting(false))
  return (
    <main id="welcome" className="screen home">
      <header className="masthead">
        <h1>Storytime</h1>
        <p className="lede">Read picture books together on a video call. Everyone sees the same page, and the reader
          gets the words in big type.</p>
      </header>
      {starting ? <StartFamily onCancel={() => setStarting(false)} /> : (
        <div className="actions">
          <button id="startFamilyBtn" className="lamp" onClick={() => setStarting(true)}>Start a family</button>
          <p className="hint">Someone already started yours? Open the family link they sent you, on this device.</p>
        </div>
      )}
      {books?.length > 0 && <>
        <h2>Books anyone can read</h2>
        <Library id="homeShelf" books={books} onPick={b => go(`view=${encodeURIComponent(b.id)}`)} />
      </>}
    </main>
  )
}

function StartFamily({onCancel}) {
  const [name, setName] = useState('')
  const [mine, setMine] = useState('')
  const submit = e => {
    e.preventDefault()
    if (name.trim() && mine.trim()) startFamily(name, mine)
  }
  return (
    <form id="startFamily" className="card" onSubmit={submit}>
      <label>Family name <input id="familyName" autoFocus placeholder="The Mandels" value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Your name <input id="myName" placeholder="Dad" value={mine} onChange={e => setMine(e.target.value)} /></label>
      <div className="row">
        <button id="createFamilyBtn" className="lamp" disabled={!name.trim() || !mine.trim()}>Start the family</button>
        <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

function FamilyHome({family}) {
  const self = useStored(ME)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useBackLayer(settingsOpen, () => setSettingsOpen(false))
  const {books, error} = useFamilyBooks(family)
  const share = () => shareLink(familyLink(family), family.name || 'Storytime')
  return (
    <main id="start" className="screen home">
      <header className="masthead">
        <h1 id="familyTitle">{family.name || 'Our family'}</h1>
        {self?.name && <p className="lede">You're <strong id="whoAmI">{self.name}</strong> on this device.</p>}
      </header>
      {self?.name ? (
        <div className="actions">
          <button id="joinCallBtn" className="lamp big" onClick={() => go('call')}>Join the call</button>
          <div className="row">
            <button id="shareFamilyBtn" className="quiet" onClick={share}>Send the family link</button>
            <button id="settingsBtn" className="quiet" onClick={() => setSettingsOpen(true)}>Settings</button>
          </div>
          <p className="hint">The family link works any time: whoever opens it joins the same call.</p>
        </div>
      ) : <WhoForm family={family} />}
      {error && <p className="warn">The books didn't load ({error}).</p>}
      <div className="shelfHead">
        <h2>Books</h2>
        <button id="addBookBtn" className="quiet" onClick={() => go('add')}>Add a book</button>
      </div>
      {books?.length > 0 && <Library id="homeShelf" books={books} onPick={b => go(`view=${encodeURIComponent(b.id)}`)} />}
      {settingsOpen && <Settings family={family} self={self} onClose={() => setSettingsOpen(false)} />}
    </main>
  )
}

// "Who's this?": asked once per device; the names already seen in this family's calls are offered.
export function WhoForm({family, onDone}) {
  const [name, setName] = useState('')
  const pick = n => { if (n.trim()) { setMyName(n); onDone?.() } }
  return (
    <form id="whoForm" className="card" onSubmit={e => { e.preventDefault(); pick(name) }}>
      <h2>Who's using this {/iPad|Tablet/i.test(navigator.userAgent) ? 'iPad' : 'device'}?</h2>
      <p className="hint">Your name goes under your video.</p>
      {family?.people?.length > 0 && (
        <div className="chips">
          {family.people.map(p => <button type="button" key={p} className="chip" onClick={() => pick(p)}>{p}</button>)}
        </div>
      )}
      <div className="row">
        <input id="whoName" autoFocus placeholder="Gramma" value={name} onChange={e => setName(e.target.value)} />
        <button id="whoBtn" className="lamp" disabled={!name.trim()}>That's me</button>
      </div>
    </form>
  )
}

function Settings({family, self, onClose}) {
  const [form, setForm] = useState({mine: self?.name || '', name: family.name || '', relay: family.relay || '', turn: family.turn || ''})
  const field = k => ({value: form[k], onChange: e => setForm(f => ({...f, [k]: e.target.value}))})
  const save = () => {
    if (form.mine.trim()) setMyName(form.mine)
    update(FAMILY, f => {
      const next = {...f, name: form.name.trim()}
      for (const k of ['relay', 'turn']) { const v = form[k].trim(); if (v) next[k] = v; else delete next[k] }
      return next
    })
    onClose()
  }
  const leave = () => {
    if (!confirm(`Remove ${family.name || 'this family'} from this device? The family link will still work if you open it again.`)) return
    leaveFamily()
    write(RECENT, null)
    onClose()
  }
  return (
    <div id="settings" className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>Settings</h2>
        <label>Your name on this device <input id="set_me" autoComplete="off" {...field('mine')} /></label>
        <label>Family name <input id="set_family" autoComplete="off" {...field('name')} /></label>
        <details>
          <summary>Connection</summary>
          <label>Signaling relays <input id="set_relay" placeholder="wss://relay.example,wss://other.example" autoComplete="off" {...field('relay')} /></label>
          <label>TURN servers (base64url JSON) <input id="set_turn" autoComplete="off" {...field('turn')} /></label>
        </details>
        <div className="row">
          <button id="settingsSave" className="lamp" onClick={save}>Save</button>
          <button id="settingsClose" className="quiet" onClick={onClose}>Cancel</button>
        </div>
        <button id="settingsLeave" className="quiet danger" onClick={leave}>Remove this family from this device</button>
      </div>
    </div>
  )
}
