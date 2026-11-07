// Passing books added in the browser between the family's devices during a call. When two devices meet (and when a
// book changes here), each sends what it has: {have: [{id, at, deleted?}]}. The other asks for the books it has no
// copy of, or an older one ({want: [ids]}), and gets each whole book (with its pictures) over the call. Removals
// travel in the list itself. Hosted books aren't passed around: every device can fetch them from the site.
import {getLocalBook, localBooks, putLocalBook} from './localbooks.js'

export function shareBooks(f, room) {
  const shelf = room.makeAction('shelf'), data = room.makeAction('bookdata')
  const summary = async () => (await localBooks(f, {withDeleted: true}))
    .map(b => b.deleted ? {id: b.id, at: b.at, deleted: true} : {id: b.id, at: b.at})
  const offer = async target => {
    const have = await summary()
    if (have.length) shelf.send({have}, target ? {target} : undefined)
  }
  shelf.onMessage = async (msg, from) => {
    const peer = from?.peerId ?? from
    if (Array.isArray(msg?.have)) {
      const mine = new Map((await localBooks(f, {withDeleted: true})).map(b => [b.id, b]))
      const want = []
      for (const t of msg.have) {
        if (mine.get(t.id)?.at >= t.at) continue
        if (t.deleted) await putLocalBook(f, t)
        else want.push(t.id)
      }
      if (want.length) shelf.send({want}, {target: peer})
    }
    if (Array.isArray(msg?.want)) {
      for (const id of msg.want) {
        const b = await getLocalBook(f, id)
        if (b) data.send(b, {target: peer})
      }
    }
  }
  data.onMessage = b => { if (b?.id && Array.isArray(b.pages) && b.at) putLocalBook(f, b) }
  return {offer}
}
