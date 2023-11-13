/** used to play the main song */
const songContext = new AudioContext();
/** used to play the counts at the start and audio feedback effects */
const effectContext = new AudioContext();
let currentSongSource;

// stores all decoded audio buffers
export const SOUNDS = {
    numbers: [],
    click: null,
    // { name: file }, lazy loaded
    songs: {},
}
init();

export function playSound(decodedAudio, isSong = false, offset = 0) {
    const audioContext = isSong ? songContext : effectContext;
    currentSongSource = audioContext.createBufferSource();
    currentSongSource.buffer = decodedAudio;
    currentSongSource.connect(audioContext.destination);
    currentSongSource.start(0, offset);
}

export function stopSong() {
    currentSongSource.stop();
}

export function playBeat(bpm, numBeats, numCounts, tracker) {
    const dt = 60 / bpm;
    if (numCounts > 0) {
        playCounts(1, numCounts, dt);
    }
    setTimeout(() => metronome(SOUNDS.click, dt, numBeats * dt, tracker), numCounts * dt * 1000);
}

function metronome(decodedAudio, dt, seconds, tracker) {
    // in seconds, usually zero
    const startAudioTime = songContext.currentTime;
    // the time now in ms, for syncing with camera
    const startAbsoluteTime = new Date().getTime();
    for (let i = 0; i * dt <= seconds; i++) {
        const source = songContext.createBufferSource();
        source.buffer = decodedAudio;
        source.connect(songContext.destination);
        const delay = i * dt;
        source.onended = () => { tracker.beat(startAbsoluteTime + delay * 1000); };
        source.start(startAudioTime + delay);
    }
}

export function playCounts(start, end, dt) {
    const startAudioTime = effectContext.currentTime;
    for (let i = start - 1; i < end; i++) {
        const source = effectContext.createBufferSource();
        source.buffer = SOUNDS.numbers[i];
        source.connect(effectContext.destination);
        const delay = i * dt;
        source.start(startAudioTime + delay);
    }
}

async function init() {
    effectContext.volume = 1.0;
    songContext.volume = 0.5;
    SOUNDS.numbers = [
        await loadSound(require("url:../assets/sound/one.mp3", false)),
        await loadSound(require("url:../assets/sound/two.mp3", false)),
        await loadSound(require("url:../assets/sound/three.mp3", false)),
        await loadSound(require("url:../assets/sound/four.mp3", false)),
    ];
    SOUNDS.click =
        await loadSound(require("url:../assets/sound/beep.mp3", true));
}

async function loadSound(url, isSong) {
    const audioContext = isSong ? songContext : effectContext;
    return await fetch(url)
        .then(data => data.arrayBuffer())
        .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer))
        .catch(onError);
}

export async function loadSong(fullname) {
    if (!SOUNDS.songs[fullname]) {
        SOUNDS.songs[fullname] =
            await fetch(`./assets/sound/musiclib/${fullname}`)
                .then(data => data.arrayBuffer())
                .then(arrayBuffer => songContext.decodeAudioData(arrayBuffer))
                .catch(onError);
    }
    return SOUNDS.songs[fullname];
}

function onError(e) {
    console.error(e);
}