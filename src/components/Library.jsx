// Book choosing, shared by the home screen, the call's book panel and its picker: books this device opened recently,
// then everything (with search once the library is big). A collection (e.g. a Frog and Toad compendium) is one card;
// tapping it shows its stories, and a story is picked like a book.
import {useState} from 'react'
import {entriesById} from '../lib/library.js'
import {useBackLayer} from '../lib/guard.js'
import {RECENT, useStored} from '../lib/store.js'

function Cover({entry, current, onClick}) {
  return (
    <button className={`cover${current ? ' cur' : ''}`} onClick={onClick}>
      <span className="art"><img src={entry.cover} alt="" /></span>
      <span className="name">{entry.title}</span>
      {entry.collection && <span className="sub">{entry.stories.length} {entry.stories.length === 1 ? 'story' : 'stories'}</span>}
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

function Stories({collection, current, onPick, onBack}) {
  return (
    <section className="stories">
      <button className="quiet back" onClick={onBack}>All books</button>
      <h3>{collection.title}</h3>
      <div className="storyList">
        {collection.stories.map(s => (
          <button key={s.id} className={s.id === current ? 'cur' : ''} onClick={() => onPick(s.id)}>
            <span className="storyTitle">{s.title}</span>
            {pageRange(s) && <span className="storyPages">{pageRange(s)}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}

// current: the id open now; openCollection: show this collection's stories first.
export function Library({id, books, current, onPick, openCollection}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(openCollection || null)
  useBackLayer(!!open && open !== openCollection, () => setOpen(null))
  const recent = useStored(RECENT) || []
  const byId = entriesById(books)
  const pick = entryId => onPick(byId.get(entryId))
  const isCurrent = e => e.id === current || (e.collection && e.stories.some(s => s.id === current))
  const choose = e => e.collection ? setOpen(e.id) : pick(e.id)

  const collection = open && byId.get(open)
  if (collection?.collection) {
    return (
      <div id={id} className="library">
        <Stories collection={collection} current={current} onPick={pick} onBack={() => setOpen(null)} />
      </div>
    )
  }

  const big = books.length > 8
  const q = query.trim().toLowerCase()
  const all = [...books].sort((a, b) => a.title.localeCompare(b.title))
  const matches = e => [e.title, e.author, ...(e.tags || [])].join(' ').toLowerCase().includes(q)
  const sections = q
    ? [['Found', [...byId.values()].filter(e => !e.collection && matches(e))]]
    : [
        ['Read lately', big ? recent.map(i => byId.get(i)).filter(e => e && !e.collection) : []],
        [big ? 'All books' : '', all],
      ]
  return (
    <div id={id} className="library">
      {big && <input type="search" placeholder="Find a book or story" value={query} onChange={e => setQuery(e.target.value)} />}
      {sections.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title || 'all'}>
          {title && <h3>{title}</h3>}
          <div className="shelf">
            {list.map(e => <Cover key={e.id} entry={e} current={isCurrent(e)} onClick={() => choose(e)} />)}
          </div>
        </section>
      ))}
      {q && !sections[0][1].length && <p className="hint">No book or story matches “{query}”.</p>}
    </div>
  )
}
