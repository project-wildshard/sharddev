"""E336: local text-to-motion on the three original dummy skeletons (no mesh regeneration).

PYTHONPATH must include the pinned UniMate checkout, Motion checkout and local deps.
Run under the machine-wide model lock. Weights remain in ~/projects/weights.
Writes raw 60-frame features and T-pose-relative model-space rotations for review.
"""
import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
from Animation import positions_global, rotations_global
from Quaternions import Quaternions
from transformers import T5EncoderModel, T5Tokenizer

from data_process.utils.motion_features import process_tpose, build_topology_cond
from data_process.joint_annotation.names_clean_rule import clean_joint_name, post_process
from unimate.configs.schema import MainConfig
from unimate.models.factory import create_model, create_transport
from unimate.models.flow.transport import Sampler
from unimate.inference.generate import ClassifierFreeSampleModel
from unimate.dataset.mixture.collate import mixture_batch_collate
from unimate.dataset.transforms import build_parent_features
from unimate.training.ema import EMAModel
from unimate.utils.motion_utils import hml_rotations_to_bvh_quaternions

PROMPTS = {
    'idle': 'An object stands still with its arms hanging loosely and gently sways its upper body.',
    'body-hit': 'An object recoils backward from a hit to the chest and returns to standing upright.',
    'head-hit': 'An object snaps its head backward from a hit and then returns to standing upright.',
    'hit-left': 'An object recoils sideways from a hit on its left shoulder and returns to standing upright.',
    'hit-right': 'An object recoils sideways from a hit on its right shoulder and returns to standing upright.',
    'heavy-hit': 'An object bends forward at the waist from a heavy hit and slowly recovers to standing upright.',
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    ap.add_argument('--weights', default=os.path.expanduser('~/projects/weights/manual/Linzhan/UniMate/unimate_uniml3d_f60_v2'))
    ap.add_argument('--text', default=os.path.expanduser('~/projects/weights/manual/google/flan-t5-base'))
    ap.add_argument('--device', default='mps')
    ap.add_argument('--seed', type=int, default=336)
    args = ap.parse_args()
    work = Path(args.work)
    cfg = MainConfig.from_json(str(Path(args.weights) / 'config.json'))
    stats = np.load(Path(args.weights) / 'dataset_stats.npy', allow_pickle=True).item()['objaverse']
    start = time.monotonic()
    torch.manual_seed(args.seed)
    torch.set_num_threads(4)
    device = torch.device(args.device)
    tok = T5Tokenizer.from_pretrained(args.text, local_files_only=True)
    encoder = T5EncoderModel.from_pretrained(args.text, local_files_only=True).to(device).eval()

    def embed(texts):
        inputs = tok(texts, padding=True, return_tensors='pt').to(device)
        with torch.inference_mode():
            hidden = encoder(**inputs).last_hidden_state
        mask = inputs.attention_mask[..., None]
        return ((hidden * mask).sum(1) / mask.sum(1)).float().cpu().numpy()

    batches, rigs = [], {}
    for variant in ['wood', 'straw-cloth', 'wood-steel']:
        raw = json.loads((work / f'{variant}.json').read_text())
        rows = raw['joints']
        q = np.array([r['quaternion'] for r in rows])[:, [3, 0, 1, 2]]
        tpos = {'names': np.array([r['name'] for r in rows]), 'parents': np.array([r['parent'] for r in rows]),
                'rest_local_pos': np.array([r['position'] for r in rows]), 'rest_local_rot': q, 'fps': np.array(30)}
        anim, offsets, scale, ground, parents, names, fps, order, face, axis = process_tpose(
            tpos, face_joints={'r_hip': {'raw': 'RightThigh'}, 'l_hip': {'raw': 'LeftThigh'}})
        clean = [post_process(clean_joint_name(n, variant)) for n in names]
        c = build_topology_cond(variant, parents, offsets, names, clean, positions_global(anim)[0],
                                anim.rotations.qs[0], rotations_global(anim).qs[0], face_joint_idxs=face, scale_factor=scale)
        n = len(names)
        mean = np.repeat(stats['mean_local'][None], n, axis=0)
        std = np.repeat(stats['std_local'][None], n, axis=0)
        mean[0], std[0] = stats['mean_root'], stats['std_root']
        ff = np.concatenate([c['tpos_first_frame'], np.tile([1, 0, 0, 0, 1, 0, 0, 0, 0], (n, 1))], axis=-1)
        ff = ((ff - mean) / std).astype(np.float32)
        joint_emb = embed(clean)
        caption_emb = embed(list(PROMPTS.values()))
        rigs[variant] = {'names': names, 'order': [int(x) for x in order], 'parents': [int(x) for x in parents],
                         'rest': raw, 'canonicalGlobalQuaternions': c['tpos_global_rotations'].tolist()}
        for i, (clip, prompt) in enumerate(PROMPTS.items()):
            b = {'motion': np.zeros((60, n, 12), np.float32), 'max_motion_length': 60, 'motion_length': 60,
                 'max_joints': cfg.dataset.max_joints, 'parents': np.array(parents), 'edge_indexs': c['edge_indexs'],
                 'tpos_first_frame': ff, 'offsets': offsets.astype(np.float32),
                 'joint_graph_dist': c['joint_graph_dists'], 'joint_relations': c['joint_relations'],
                 'joint_depths': np.array(c['joint_depths']), 'spectral_feats': c['spectral_feats'].astype(np.float32),
                 'joint_names_emb': joint_emb, 'object_type': variant, 'start_idx': 0,
                 'mean': mean.astype(np.float32), 'std': std.astype(np.float32), 'caption_emb': caption_emb[i],
                 'clip': clip, 'prompt': prompt}
            b.update(build_parent_features(ff, parents))
            batches.append(b)
    del encoder
    torch.mps.empty_cache() if device.type == 'mps' else None
    model = create_model(cfg.dataset, cfg.model)
    ckpt = torch.load(Path(args.weights) / 'checkpoints/checkpoint_step_100000.pt', map_location='cpu', weights_only=False)
    model.load_state_dict(ckpt['model_state_dict'])
    ema = EMAModel(model.parameters())
    ema.load_state_dict(ckpt['ema_state_dict'])
    ema.copy_to(model.parameters())
    del ckpt, ema
    model = model.to(device).eval()
    guided = ClassifierFreeSampleModel(model, cfg_scale=3)
    sampler = Sampler(create_transport(training_config=cfg.training)).sample_ode(sampling_method='heun2', num_steps=32)
    outputs = []
    for b in batches:
        t = time.monotonic()
        motion, cond = mixture_batch_collate([b])
        cond = {k: v.to(device) if torch.is_tensor(v) else v for k, v in cond.items()}
        with torch.inference_mode():
            result = sampler(torch.randn(motion.shape, device=device), guided, cond=cond)[-1]
        n = len(b['parents'])
        features = result[0, :n].cpu().permute(2, 0, 1).numpy() * b['std'][None] + b['mean'][None]
        if not np.isfinite(features).all():
            raise ValueError('Non-finite generated motion')
        delta = hml_rotations_to_bvh_quaternions(features[:, :, 3:9], b['parents']).qs
        np.save(work / f"{b['object_type']}-{b['clip']}-raw.npy", features)
        outputs.append({'variant': b['object_type'], 'clip': b['clip'], 'prompt': b['prompt'],
                        'names': rigs[b['object_type']]['names'], 'parents': rigs[b['object_type']]['parents'],
                        'deltaQuaternionsWXYZ': delta.tolist(), 'seconds': round(time.monotonic() - t, 3)})
        print('GENERATED', b['object_type'], b['clip'], outputs[-1]['seconds'], flush=True)
        (work / 'generated.json').write_text(json.dumps({'seed': args.seed, 'device': args.device, 'rigs': rigs, 'clips': outputs}))
    print('TOTAL', round(time.monotonic() - start, 3), 'MPS bytes', torch.mps.driver_allocated_memory() if device.type == 'mps' else 0, flush=True)


if __name__ == '__main__':
    main()
