// The parent's phone before a call: who's reading, tonight's books, call (always the same call per reader), settings.
import {useEffect, useState} from 'react'
import {guardHome, useBackLayer} from '../lib/guard.js'
import {Library} from './Library.jsx'
import {useLibrary} from '../lib/library.js'
import {go, linkWith, shareLink} from '../lib/links.js'
import {MY_CALL, RECENT, SETUP, callLink, homeLinkParams, newCall, update, useStored, write} from '../lib/store.js'

export function Home() {
  const setup = useStored(SETUP)
  const [picked, setPicked] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  useBackLayer(settingsOpen, () => setSettingsOpen(false))
  useBackLayer(browsing, () => setBrowsing(false))
  const reader = setup?.current || ''
  const {books, error} = useLibrary(setup?.lk, setup?.lib)
  useEffect(guardHome, [])

  // Straight into this reader's call (the same room every time, so leaving and calling again finds the reader still
  // there); tonight's books ride in this phone's own address and go to the reader's tablet over the call.
  const startCall = () => {
    const p = callLink(setup, reader)
    if (picked.length) p.set('b', picked.join(','))
    go(p)
  }
  const title = setup?.child ? `Storytime with ${setup.child}` : 'Storytime'
  const sendLink = () => shareLink(linkWith(callLink(setup, reader)), title)

  return (
    <section id="start" className="screen on center">
      <h1>Storytime</h1>
      <>
        <Readers setup={setup || {}} />
        <p id="startText">{reader || 'The reader'}'s link stays the same: send it once (or ahead of time) and you can both open it.</p>
        <div className="row">
          <button id="startBtn" onClick={startCall}>{reader ? `Call ${reader}` : 'Start a call'}</button>
          <button id="sendLinkBtn" className="ghost" onClick={sendLink}>Send {reader || 'the reader'} the link</button>
        </div>
        {error && <p className="warn">Couldn't open the books ({error}).</p>}
        <p id="startHint">{picked.length ? `${picked.length} book${picked.length > 1 ? 's' : ''} for tonight` : 'Tap books for tonight before calling (optional)'}</p>
        {books && <Library id="startShelf" books={books} picked={picked}
          onPick={b => setPicked(p => p.includes(b.id) ? p.filter(i => i !== b.id) : [...p, b.id])} />}
        {!setup?.lk && <p id="keyHint" className="small">Have a Storytime home link? Open it once on this device to add your own books.</p>}
        <div className="row">
          <button id="viewBtn" className="ghost small" onClick={() => setBrowsing(true)}>Look at the books</button>
          <button id="settingsBtn" className="ghost small" onClick={() => setSettingsOpen(true)}>Settings</button>
        </div>
        {browsing && books && (
          <div id="browse" className="overlay on" onClick={e => e.target === e.currentTarget && setBrowsing(false)}>
            <div id="pickerSheet">
              <h2>Look at a book</h2>
              <p className="small">Each book opens in a new tab, as {reader || 'the reader'} sees it, with a PDF download.</p>
              <Library id="browseShelf" books={books} onPick={e => window.open(`${location.pathname}#view=${encodeURIComponent(e.id)}`, '_blank')} />
              <button id="browseClose" className="ghost" onClick={() => setBrowsing(false)}>Close</button>
            </div>
          </div>
        )}
        {settingsOpen && <Settings setup={setup || {}} onClose={() => setSettingsOpen(false)} />}
      </>
    </section>
  )
}

// "Who's reading?": one button per reader, the current one highlighted; + opens a name field to add one.
function Readers({setup}) {
  const readers = setup.readers || []
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const pick = current => update(SETUP, s => ({...s, current}))
  const add = e => {
    e.preventDefault()
    const n = name.trim()
    if (n) update(SETUP, s => ({...s, readers: [...new Set([...(s.readers || []), n])], current: n}))
    setName('')
    setAdding(false)
  }
  return (
    <div id="readersRow">
      <p>Who's reading?</p>
      <div id="readers" className="row">
        {readers.map(r => (
          <button key={r} className={`chip${r === setup.current ? ' cur' : ''}`} onClick={() => pick(r)}>{r}</button>
        ))}
        {adding
          ? <form className="addReader" onSubmit={add}>
              <input id="newReader" autoFocus placeholder="Name, e.g. Gramma" value={name}
                onChange={e => setName(e.target.value)} onBlur={add} />
            </form>
          : <button className="chip add" aria-label="Add a reader" onClick={() => setAdding(true)}>
              {readers.length ? '+' : '+ Add who reads'}
            </button>}
      </div>
    </div>
  )
}

function Settings({setup, onClose}) {
  const [form, setForm] = useState({
    readers: (setup.readers || []).join('\n'), child: setup.child || '', relay: setup.relay || '', turn: setup.turn || '',
  })
  const field = k => ({value: form[k], onChange: e => setForm(f => ({...f, [k]: e.target.value}))})
  const saveSettings = () => {
    update(SETUP, s => {
      const next = {...s}
      for (const k of ['child', 'relay', 'turn']) {
        const v = form[k].trim()
        if (v) next[k] = v; else delete next[k]
      }
      next.readers = [...new Set(form.readers.split('\n').map(n => n.trim()).filter(Boolean))]
      if (next.calls) next.calls = Object.fromEntries(Object.entries(next.calls).filter(([r]) => next.readers.includes(r)))
      if (!next.readers.includes(next.current)) next.current = next.readers[0] || ''
      return next
    })
    onClose()
  }
  const forget = () => {
    if (!confirm("Forget the books key, names and readers' links on this device?")) return
    for (const k of [SETUP, RECENT, MY_CALL]) write(k, null)
    onClose()
  }
  return (
    <div id="settings" className="overlay on" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <h2>Settings</h2>
        <label>Who reads (one name per line) <textarea id="set_readers" rows="3" placeholder={'Gramma\nGrammie'} {...field('readers')} /></label>
        <label>Child's name <input id="set_child" placeholder="Cleo" autoComplete="off" {...field('child')} /></label>
        <details>
          <summary>Connection</summary>
          <label>Signaling relays <input id="set_relay" placeholder="wss://relay.example,wss://other.example" autoComplete="off" {...field('relay')} /></label>
          <label>TURN servers (base64url JSON) <input id="set_turn" autoComplete="off" {...field('turn')} /></label>
        </details>
        <div className="row">
          <button id="settingsSave" onClick={saveSettings}>Save</button>
          <button id="settingsClose" className="ghost" onClick={onClose}>Cancel</button>
        </div>
        {setup.current && <button id="settingsNewLink" className="ghost small" onClick={() => {
          if (confirm(`Make a new link for ${setup.current}? The old one stops working.`)) { newCall(setup.current); onClose() }
        }}>New link for {setup.current}</button>}
        <button id="settingsHome" className="ghost small" onClick={() => shareLink(linkWith(homeLinkParams(setup)))}>
          Share home link (set up another device)
        </button>
        <button id="settingsForget" className="ghost small danger" onClick={forget}>Forget this device</button>
      </div>
    </div>
  )
}
