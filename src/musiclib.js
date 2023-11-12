// should be generated

export function listSongs() {
    return FILES.map((fullName, i) => ({
        bpm: Number(fullName.substring(0, 3)),
        name: fullName.substring(6, fullName.length - 4),
        fullName,
        delay: DELAYS[i],
        fastForward: FFS[i],
    }
    ));
}

const FILES = [
    '100 - Rock the Party - Alexi Action.mp3',
];

// number of beats to delay at the start
const DELAYS = [
    14, // '100 - Rock the Party - Alexi Action.mp3',
];

// seconds to fast-forward a track at the start
const FFS = [
    30, // '100 - Rock the Party - Alexi Action.mp3',
];
