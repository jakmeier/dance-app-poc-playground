const context = new AudioContext();

// stores all decoded audio buffers
export const SOUNDS = {
    numbers: [],
    click: null,
}
init();

export function playSound(decodedAudio) {
    source = context.createBufferSource();
    source.buffer = decodedAudio;
    source.connect(context.destination);
    source.start();
}

export function playBeat(bpm, numBeats, tracker) {
    const dt = 60 / bpm;
    playCounts(1, 4, dt);
    setTimeout(() => metronome(SOUNDS.click, dt, numBeats * dt, tracker), 4 * dt * 1000);
}

function metronome(decodedAudio, dt, seconds, tracker) {
    // in seconds, usually zero
    const startAudioTime = context.currentTime;
    // the time now in ms, for syncing with camera
    const startAbsoluteTime = new Date().getTime();
    for (let i = 0; i * dt <= seconds; i++) {
        const source = context.createBufferSource();
        source.buffer = decodedAudio;
        source.connect(context.destination);
        const delay = i * dt;
        source.onended = () => { tracker.beat(startAbsoluteTime + delay * 1000); };
        source.start(startAudioTime + delay);
    }
}

function playCounts(start, end, dt) {
    const startAudioTime = context.currentTime;
    for (let i = start - 1; i < end; i++) {
        const source = context.createBufferSource();
        source.buffer = SOUNDS.numbers[i];
        source.connect(context.destination);
        const delay = i * dt;
        source.start(startAudioTime + delay);
    }
}

async function init() {
    SOUNDS.numbers = [
        await loadSound(require("url:../assets/sound/one.mp3")),
        await loadSound(require("url:../assets/sound/two.mp3")),
        await loadSound(require("url:../assets/sound/three.mp3")),
        await loadSound(require("url:../assets/sound/four.mp3")),
    ];
    SOUNDS.click =
        await loadSound(require("url:../assets/sound/beep.mp3"));
}

async function loadSound(url) {
    return await fetch(url)
        .then(data => data.arrayBuffer())
        .then(arrayBuffer => context.decodeAudioData(arrayBuffer))
        .catch(onError);
}

function onError(e) {
    console.error(e);
}