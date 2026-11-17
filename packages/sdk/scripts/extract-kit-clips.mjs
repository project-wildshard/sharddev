#!/usr/bin/env node
// OF3b1: capture existing admitted animation content from immutable SDK objects.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';

const revision = '81d8fc527fcc6332c755aa8cb078d189e5dc1dd3', glb = 'b4fbde0422e125b498c3dc8b9a5cc2516c8598f09e9d0e5f6b639b32f98179e6';
const skin = 'bfa4dfc9c18979f904557ee8deab0058b8a399be10266f5fb1578b403f482fd4';
const object = name => execFileSync('git', ['show', `${revision}:src/shards/_template/assets/${name}`]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = object(glb), bindingBytes = object(skin);
if (hash(bytes) !== glb || hash(bindingBytes) !== skin) throw new Error('Original clip content hash differs');
const doc = await new NodeIO().readBinary(bytes), definition = JSON.parse(bindingBytes);
const joints = doc.getRoot().listSkins()[0]?.listJoints();
if (!joints) throw new Error('Original clip skeleton is absent');
const names = new Set(joints.map(node => node.getName()));
const bones = joints.map(node => ({ name: node.getName(), parent: names.has(node.getParentNode()?.getName()) ? node.getParentNode().getName() : null,
  position: node.getTranslation(), rotation: node.getRotation(), scale: node.getScale() }));
const clips = doc.getRoot().listAnimations().map(animation => ({ name: animation.getName(), tracks: animation.listChannels().flatMap(channel => {
  const bone = channel.getTargetNode()?.getName();
  // Actor motion owns the scene root. The existing skin driver also consumes only named joint tracks.
  if (!names.has(bone)) return [];
  const sampler = channel.getSampler();
  if (!sampler || sampler.getInterpolation() !== 'LINEAR') throw new Error('Original clip uses an unsupported sampler');
  const path = channel.getTargetPath(), property = path === 'translation' ? 'position' : path === 'rotation' ? 'quaternion' : path;
  return [{ bone, property, times: [...sampler.getInput().getArray()], values: [...sampler.getOutput().getArray()] }];
}) }));
const result = { version: 1, source: { repo: 'sharddev', revision, glb, skin }, bones, clips, binding: definition.binding };
const output = new TextEncoder().encode(JSON.stringify(result) + '\n');
const destination = new URL('../../kit/content/clips/quadruped.json', import.meta.url);
if (process.argv.includes('--check')) {
  if (!Buffer.from(output).equals(readFileSync(destination))) throw new Error('Kit clip content differs');
} else { mkdirSync(fileURLToPath(new URL('.', destination)), { recursive: true }); writeFileSync(destination, output); }
console.info(`Kit quadruped clips: ${clips.length}, ${output.length} bytes, ${hash(output)}`);
