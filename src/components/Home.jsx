// The parent's phone before a call: who's reading, tonight's books, start (or get back to) a call, settings.
import {useEffect, useState} from 'react'
import {guardHome, useBackLayer} from '../lib/guard.js'
import {Library} from './Library.jsx'
import {useLibrary} from '../lib/library.js'
import {go, goReplace, linkWith, randomId, shareLink} from '../lib/links.js'
import {LAST_CALLS, RECENT, SETUP, homeLinkParams, setupParams, update, useStored, write} from '../lib/store.js'

export function Home() {
  const setup = useStored(SETUP)
  const [invite, setInvite] = useState(null)
  const [picked, setPicked] = useState([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  useBackLayer(!!invite, () => setInvite(null))
  useBackLayer(settingsOpen, () => setSettingsOpen(false))
  useBackLayer(browsing, () => setBrowsing(false))
  const reader = setup?.current || ''
  const {books, error} = useLibrary(setup?.lk, setup?.lib)
  useEffect(guardHome, [])

  const startCall = () => {
    const p = setupParams(setup)
    p.set('r', randomId(12))
    p.set('k', randomId(18))
    if (picked.length) p.set('b', picked.join(','))
    const links = {}
    for (const role of ['reader', 'child']) {
      const q = new URLSearchParams(p)
      q.set('as', role)
      links[role] = q
    }
    update(LAST_CALLS, all => ({...all, [reader]: {child: linkWith(links.child), reader: linkWith(links.reader), at: Date.now()}}))
    setInvite({readerLink: linkWith(links.reader), childParams: links.child})
  }

  if (invite) return <Invite reader={reader} child={setup?.child} {...invite} />

  return (
    <section id="start" className="screen on center">
      <h1>Storytime</h1>
      <>
        <Readers setup={setup || {}} />
        <p id="startText">Start a call here, then send the link to {reader || 'the reader'}.</p>
        {error && <p className="warn">Couldn't open the books ({error}).</p>}
        <p id="startHint">{picked.length ? `${picked.length} book${picked.length > 1 ? 's' : ''} for tonight` : 'Tap books for tonight (optional)'}</p>
        {books && <Library id="startShelf" books={books} picked={picked}
          onPick={b => setPicked(p => p.includes(b.id) ? p.filter(i => i !== b.id) : [...p, b.id])} />}
        <button id="startBtn" onClick={startCall}>Start a call</button>
        <LastCall reader={reader} child={setup?.child} />
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

// Get back into the last call with this reader (left by accident, or the text didn't arrive), for 12 hours.
function LastCall({reader, child}) {
  const last = (useStored(LAST_CALLS) || {})[reader]
  const ago = last && (Date.now() - last.at) / 60000
  if (!last || ago > 12 * 60) return null
  const when = ago < 1 ? 'just now' : ago < 60 ? `${Math.round(ago)} min ago` : `${Math.round(ago / 60)} h ago`
  return (
    <div id="lastCall">
      <p id="lastCallText">Last call{reader ? ` with ${reader}` : ''}: {when}</p>
      <div className="row">
        <button id="lastBackBtn" className="ghost" onClick={() => go(new URL(last.child).hash.slice(1))}>Back to the call</button>
        <button id="lastSendBtn" className="ghost" onClick={() => shareLink(last.reader, child ? `Storytime with ${child}` : 'Storytime')}>Send link again</button>
      </div>
    </div>
  )
}

function Invite({reader, child, readerLink, childParams}) {
  const [copied, setCopied] = useState(false)
  return (
    <section id="invite" className="screen on center">
      <h1 id="inviteTitle">Send this to {reader || 'the reader'}</h1>
      {navigator.share && <button id="shareBtn" onClick={() => shareLink(readerLink, child ? `Storytime with ${child}` : 'Storytime')}>Share link</button>}
      <button id="copyBtn" className="ghost" onClick={() => navigator.clipboard.writeText(readerLink).then(() => setCopied(true))}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <div id="linkbox">{readerLink}</div>
      <button id="goBtn" className="ghost" onClick={() => goReplace(childParams)}>Open the call</button>
    </section>
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
      if (!next.readers.includes(next.current)) next.current = next.readers[0] || ''
      return next
    })
    onClose()
  }
  const forget = () => {
    if (!confirm('Forget the books key, names and last calls on this device?')) return
    for (const k of [SETUP, LAST_CALLS, RECENT]) write(k, null)
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
        <button id="settingsHome" className="ghost small" onClick={() => shareLink(linkWith(homeLinkParams(setup)))}>
          Share home link (set up another device)
        </button>
        <button id="settingsForget" className="ghost small danger" onClick={forget}>Forget this device</button>
      </div>
    </div>
  )
}
