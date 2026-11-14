/**
 * Ask a question from the terminal, against the same code path the endpoint
 * serves. Useful for checking an answer without a browser, and for proving
 * that the thing works with no API key present.
 *
 *   npm run ask -- "Will PMMA burn at 34% oxygen?"
 *   npm run ask            (lists the pinned demo questions)
 */
import { handleAsk } from './ask.ts'
import { SUGGESTIONS } from './canned.ts'

const question = process.argv.slice(2).join(' ').trim()

if (!question) {
  console.log('Pinned demo questions:\n')
  for (const s of SUGGESTIONS) console.log(`  ${s}`)
  console.log('\nUsage: npm run ask -- "your question"')
  process.exit(0)
}

const { status, body } = await handleAsk('POST', null, { question })

if (status !== 200 || !('answer' in body)) {
  console.error(status, body)
  process.exit(1)
}

const line = '─'.repeat(72)
console.log(line)
console.log(`Q: ${body.question}`)
console.log(line)
console.log(`\nGRADE: ${body.grade.toUpperCase()}\n`)
console.log(body.answer + '\n')
console.log('Read as:', JSON.stringify(body.interpretation))
console.log(`Prose from: ${body.meta.answerMode}   reading from: ${body.meta.readingMode}` +
  `${body.meta.pinned ? '   (pinned)' : ''}`)
if (body.meta.rejectedNumbers.length) {
  console.log(`REJECTED invented numbers: ${body.meta.rejectedNumbers.join(', ')}`)
}
console.log(`\nFacts (${body.facts.length}):`)
for (const f of body.facts) console.log(`  - ${f}`)
console.log(`\nMatches: ${body.matches.length}   Nearest: ${body.nearest.length}`)
for (const row of [...body.matches, ...body.nearest].slice(0, 5)) {
  console.log(`  ${row.id.padEnd(14)} ${row.fuel.slice(0, 34).padEnd(36)} ${row.outcome}`)
}
if (body.blocked) console.log(`\nBLOCKED: ${body.blocked}`)
if (body.citations.length) {
  console.log('\nCitations:')
  for (const c of body.citations) console.log(`  ${c.accession}  ${c.acronym}  ${c.doi}`)
}
