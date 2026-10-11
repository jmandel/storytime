// Book choosing, shared by the start screen, the reader's shelf and the phone's picker: tonight's stack, books
// this device opened recently, then everything (with search once the library is big). A collection (e.g. a Frog
// and Toad compendium) is one card; tapping it shows its stories, and a story is picked like a book.
import {useState} from 'react'
import {entriesById} from '../lib/library.js'
import {useBackLayer} from '../lib/guard.js'
import {RECENT, useStored} from '../lib/store.js'

function BookButton({entry, current, pickNumber, onClick}) {
  return (
    <button className={current || pickNumber ? 'cur' : ''} onClick={onClick}>
      <img src={entry.cover} alt="" />
      {entry.title}
      {entry.collection && <span className="storyCount">{entry.stories.length} {entry.stories.length === 1 ? 'story' : 'stories'}</span>}
      {pickNumber ? <span className="pickNum">{pickNumber}</span> : null}
    </button>
  )
}

// "Pages 158–169" from the first and last page labels' printed numbers ("Pages 158–159" ... "Pages 168–169").
function pageRange(s) {
  const nums = [s.first, s.last].map(l => l?.match(/\d+/g)).filter(Boolean)
  if (!nums.length) return null
  const from = nums[0][0], to = nums.at(-1).at(-1)
  return from === to ? `Page ${from}` : `Pages ${from}–${to}`
}

function Stories({collection, current, picked, onPick, onBack}) {
  return (
    <section className="stories">
      <button className="ghost small back" onClick={onBack}>← All books</button>
      <h3>{collection.title}</h3>
      <div className="storyList">
        {collection.stories.map(s => {
          const n = picked ? picked.indexOf(s.id) + 1 : 0
          return (
            <button key={s.id} className={s.id === current || n ? 'cur' : ''} onClick={() => onPick(s.id)}>
              <span className="storyTitle">{s.title}</span>
              {pageRange(s) && <span className="storyPages">{pageRange(s)}</span>}
              {n ? <span className="pickNum">{n}</span> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// stack: ids shown under "Tonight" (in order); picked: when set, the stack being built (numbered, toggled by
// onPick); current: the id open now; openCollection: show this collection's stories first.
export function Library({id, books, stack = [], picked, current, onPick, openCollection}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(openCollection || null)
  useBackLayer(!!open && open !== openCollection, () => setOpen(null))
  const recent = useStored(RECENT) || []
  const byId = entriesById(books)
  const pick = entryId => onPick(byId.get(entryId))
  const isCurrent = e => e.id === current || (e.collection && e.stories.some(s => s.id === current))
  const pickNumber = e => picked ? picked.indexOf(e.id) + 1 : 0
  const choose = e => e.collection ? setOpen(e.id) : pick(e.id)

  const collection = open && byId.get(open)
  if (collection?.collection) {
    return (
      <div id={id} className="library">
        <Stories collection={collection} current={current} picked={picked} onPick={pick} onBack={() => setOpen(null)} />
      </div>
    )
  }

  const big = books.length > 8
  const q = query.trim().toLowerCase()
  const tonight = (picked || stack).map(i => byId.get(i)).filter(Boolean)
  const all = [...books].sort((a, b) => a.title.localeCompare(b.title))
  const matches = e => [e.title, e.author, ...(e.tags || [])].join(' ').toLowerCase().includes(q)
  const sections = q
    ? [['Found', [...byId.values()].filter(e => !e.collection && matches(e))]]
    : [
        ['Tonight', tonight],
        ['Recent', big ? recent.map(i => byId.get(i)).filter(e => e && !e.collection && !tonight.includes(e)) : []],
        [tonight.length || big ? 'All books' : '', all],
      ]
  return (
    <div id={id} className="library">
      {big && <input type="search" placeholder="Find a book or story" value={query} onChange={e => setQuery(e.target.value)} />}
      {sections.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title || 'all'}>
          {title && <h3>{title}</h3>}
          <div className="mini-shelf">
            {list.map(e => (
              <BookButton key={e.id} entry={e} current={isCurrent(e)} pickNumber={pickNumber(e)}
                onClick={() => choose(e)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
