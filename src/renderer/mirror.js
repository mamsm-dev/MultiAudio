'use strict';
// Windows engine: capture system loopback audio and replay it on each chosen output.
window.Mirror = (() => {
  let stream = null;
  const outputs = new Map(); // deviceId -> { context, delay, gain }

  async function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    const closing = [...outputs.values()].map((o) => o.context.close());
    outputs.clear();
    await Promise.allSettled(closing);
  }

  async function start(targets) {
    await stop();
    if (!targets.length) throw new Error('NO_TARGET');
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (!stream.getAudioTracks().length) throw new Error('NO_AUDIO');
      const audioOnly = new MediaStream(stream.getAudioTracks());
      for (const { id, volume, delay, muted } of targets) {
        const context = new AudioContext({ latencyHint: 'interactive' });
        const nodes = { context, delay: context.createDelay(1), gain: context.createGain(), volume, muted };
        outputs.set(id, nodes);
        await context.setSinkId(id);
        nodes.delay.delayTime.value = delay / 1000;
        nodes.gain.gain.value = muted ? 0 : volume / 100;
        context.createMediaStreamSource(audioOnly).connect(nodes.delay).connect(nodes.gain).connect(context.destination);
        await context.resume();
      }
    } catch (err) {
      await stop();
      throw err;
    }
  }

  function set(id, key, value) {
    const o = outputs.get(id);
    if (!o) return;
    if (key === 'delay') {
      o.delay.delayTime.value = value / 1000;
      return;
    }
    o[key] = value; // volume or muted
    o.gain.gain.value = o.muted ? 0 : o.volume / 100;
  }

  return { start, stop, set };
})();
