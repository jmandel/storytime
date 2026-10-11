// Book choosing, shared by the start screen, the reader's shelf and the phone's picker: tonight's stack, books
// this device opened recently, then everything (with search once the library is big).
import {useState} from 'react'
import {RECENT, useStored} from '../lib/store.js'

function BookButton({book, current, pickNumber, onPick}) {
  return (
    <button className={current || pickNumber ? 'cur' : ''} onClick={() => onPick(book)}>
      <img src={book.cover} alt="" />
      {book.title}
      {pickNumber ? <span className="pickNum">{pickNumber}</span> : null}
    </button>
  )
}

// stack: ids shown under "Tonight" (in order); picked: when set, the stack being built (numbered, toggled by
// onPick); current: the id of the book open now.
export function Library({id, books, stack = [], picked, current, onPick}) {
  const [query, setQuery] = useState('')
  const recent = useStored(RECENT) || []
  const byId = new Map(books.map(b => [b.id, b]))
  const big = books.length > 8
  const q = query.trim().toLowerCase()
  const tonight = (picked || stack).map(i => byId.get(i)).filter(Boolean)
  const sections = q
    ? [['Found', books.filter(b => [b.title, b.author, ...(b.tags || [])].join(' ').toLowerCase().includes(q))]]
    : [
        ['Tonight', tonight],
        ['Recent', big ? recent.map(i => byId.get(i)).filter(b => b && !tonight.includes(b)) : []],
        [tonight.length || big ? 'All books' : '', [...books].sort((a, b) => a.title.localeCompare(b.title))],
      ]
  return (
    <div id={id} className="library">
      {big && <input type="search" placeholder="Find a book" value={query} onChange={e => setQuery(e.target.value)} />}
      {sections.filter(([, list]) => list.length).map(([title, list]) => (
        <section key={title || 'all'}>
          {title && <h3>{title}</h3>}
          <div className="mini-shelf">
            {list.map(b => {
              const n = picked ? picked.indexOf(b.id) + 1 : 0
              return <BookButton key={b.id} book={b} current={b.id === current} pickNumber={n} onPick={onPick} />
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
