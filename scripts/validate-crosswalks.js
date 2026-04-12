#!/usr/bin/env node
// validate-crosswalks.js — enum + structural validator for crosswalk YAMLs.
// Reads vocabulary.yaml, checks every crosswalk/*.yaml against it.
// Usage: node scripts/validate-crosswalks.js [--verbose]
// Exit:  0 = all pass, 1 = any failure
'use strict'

const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')

const ROOT = path.resolve(__dirname, '..')
const VOCAB_PATH = path.join(ROOT, 'vocabulary.yaml')
const CROSSWALK_DIR = path.join(ROOT, 'crosswalk')
const verbose = process.argv.includes('--verbose')

const vocab = yaml.load(fs.readFileSync(VOCAB_PATH, 'utf8'))
const canonicalSignalTypes = new Set(Object.keys(vocab.signal_types || {}))
const canonicalMatchTypes = new Set(Object.keys(vocab.crosswalk_match_types || {}))
// decision_trajectory entries are valid signal-level keys (veritasacta maps them)
const canonicalTrajectory = new Set(Object.keys(vocab.decision_trajectory || {}))
const descriptorEnums = {}
for (const [dim, def] of Object.entries(vocab.descriptor_dimensions || {})) {
  if (def && Array.isArray(def.values)) descriptorEnums[dim] = new Set(def.values)
}

function walkYaml(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkYaml(full))
    else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) out.push(full)
  }
  return out.sort()
}

const errors = []
const warnings = []

function err(file, msg) {
  const rel = path.relative(ROOT, file)
  errors.push(`ERROR  ${rel}: ${msg}`)
}

function warn(file, msg) {
  const rel = path.relative(ROOT, file)
  warnings.push(`WARN   ${rel}: ${msg}`)
}

function isStandardCrosswalk(doc) {
  return doc && typeof doc === 'object' && doc.signal_types && typeof doc.signal_types === 'object'
}

function validateSystem(doc, file) {
  const sys = doc.system
  if (!sys) { err(file, 'missing `system` block'); return }
  if (typeof sys === 'string') { warn(file, '`system` is a plain string, not a block with `name`+`repo`/`home`'); return }
  if (!sys.name) err(file, '`system.name` is required')
  if (!sys.home && !sys.repo) warn(file, '`system` has neither `home` nor `repo` URL')
}

function validateSignalTypes(doc, file) {
  for (const [key, entry] of Object.entries(doc.signal_types)) {
    if (!entry || typeof entry !== 'object') continue
    const canonical = entry.canonical || key
    if (!canonicalSignalTypes.has(canonical) && !canonicalTrajectory.has(canonical)) {
      err(file, `signal_types.${key}: canonical "${canonical}" is not in vocabulary.yaml signal_types or decision_trajectory`)
    }
    if (entry.match) {
      if (!canonicalMatchTypes.has(entry.match)) {
        err(file, `signal_types.${key}: match "${entry.match}" not in crosswalk_match_types (allowed: ${[...canonicalMatchTypes].join(', ')})`)
      }
      if ((entry.match === 'structural' || entry.match === 'partial') && !entry.divergence && !entry.notes) {
        warn(file, `signal_types.${key}: match "${entry.match}" has no divergence or notes explaining the difference`)
      }
      if (entry.match === 'no_mapping' && !entry.notes && !entry.note) {
        warn(file, `signal_types.${key}: match "no_mapping" without a note explaining the gap`)
      }
    }
  }
}

function validateDescriptors(doc, file) {
  const dims = doc.descriptor_dimensions
  if (!dims || typeof dims !== 'object') return
  for (const [sigKey, dimBlock] of Object.entries(dims)) {
    if (!dimBlock || typeof dimBlock !== 'object') continue
    for (const [dimName, value] of Object.entries(dimBlock)) {
      if (dimName.endsWith('_notes')) continue
      const allowed = descriptorEnums[dimName]
      if (!allowed) continue
      const values = Array.isArray(value) ? value : [value]
      for (const v of values) {
        if (typeof v === 'string' && !allowed.has(v)) {
          err(file, `descriptor_dimensions.${sigKey}.${dimName}: "${v}" not in vocabulary (allowed: ${[...allowed].join(', ')})`)
        }
      }
    }
  }
}

function validateFile(file) {
  let doc
  try {
    doc = yaml.load(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    err(file, `YAML parse error: ${e.message}`)
    return
  }
  if (!doc || typeof doc !== 'object') {
    err(file, 'file is empty or not an object')
    return
  }

  if (doc.crosswalk_type === 'rfc_category_reverse') {
    if (verbose) console.log(`  skip  ${path.relative(ROOT, file)} (reverse crosswalk)`)
    return
  }
  if (!isStandardCrosswalk(doc)) {
    warn(file, 'no `signal_types` section found; skipping validation (alternative crosswalk format)')
    return
  }

  validateSystem(doc, file)
  validateSignalTypes(doc, file)
  validateDescriptors(doc, file)
}

const files = walkYaml(CROSSWALK_DIR)
if (files.length === 0) {
  console.log('No crosswalk YAML files found.')
  process.exit(0)
}

console.log(`validate-crosswalks: checking ${files.length} file(s) against vocabulary.yaml`)
console.log(`  signal types: ${[...canonicalSignalTypes].join(', ')}`)
console.log(`  match types:  ${[...canonicalMatchTypes].join(', ')}`)
console.log(`  dimensions:   ${Object.keys(descriptorEnums).join(', ')}`)
console.log('')

for (const file of files) {
  const rel = path.relative(ROOT, file)
  if (verbose) console.log(`  check ${rel}`)
  validateFile(file)
}

if (warnings.length > 0) {
  console.log('')
  for (const w of warnings) console.log(w)
}

if (errors.length > 0) {
  console.log('')
  for (const e of errors) console.log(e)
  console.log('')
  console.log(`FAIL: ${errors.length} error(s), ${warnings.length} warning(s) across ${files.length} file(s)`)
  process.exit(1)
}

console.log('')
console.log(`PASS: 0 errors, ${warnings.length} warning(s) across ${files.length} file(s)`)
process.exit(0)
