// Collections: a story is chosen from the collection's contents and opens with the collection's title and printed
// page numbers; the phone's bar shows it. Speakers are colors only (no name labels); names in narration share the color.
import {browser, check, member, joinCall, waitSeeing, testRoom} from './lib.mjs'
const room = testRoom()
const reader = await member('Gramma', {room}), child = await member('Cleo', {room, width: 390, height: 844, mobile: true})
const col = reader.locator('#homeShelf .cover', {hasText: 'Frog and Toad'})
check(await col.count() === 1 && (await col.textContent()).includes('story'), `collection card on the home shelf: ${await col.textContent()}`)
await joinCall(reader); await joinCall(child)
await waitSeeing(reader, 1)
await reader.locator('#shelf .cover', {hasText: 'Frog and Toad'}).click()
const stories = await reader.locator('#shelf .storyList button').allTextContents()
check(stories.some(s => s.includes('Ice Cream') && s.includes('Pages 158–169')), `contents: ${stories}`)
await reader.locator('#shelf .storyList button', {hasText: 'Ice Cream'}).click()
await reader.waitForSelector('#strip img', {timeout: 20000})
check((await reader.textContent('#bookTitle')) === 'Frog and Toad: Ice Cream', `title: ${await reader.textContent('#bookTitle')}`)
check((await reader.textContent('#shelfBtn')) === 'Contents', 'the shelf button says Contents inside a collection')
check((await reader.textContent('#pageNum')) === 'Pages 158–159', `printed page numbers: ${await reader.textContent('#pageNum')}`)
check(await reader.locator('#pageText .said').count() > 0, 'speakers in color')
check(await reader.locator('#pageText .named').count() > 0, `speaker names in narration colored: ${await reader.locator('#pageText .named').allTextContents()}`)
check(await child.waitForFunction(() => document.getElementById('bookBar')?.textContent.includes('Frog and Toad: Ice Cream'), null, {timeout: 20000}).then(() => true, () => false),
  `phone bar: ${await child.textContent('#bookBar').catch(() => '')}`)
await reader.click('#shelfBtn')
check(await reader.locator('#shelf .storyList button.cur').count() === 1, 'Contents opens on the collection with the story marked')
await browser.close()
