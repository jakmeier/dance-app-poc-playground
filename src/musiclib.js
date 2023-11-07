// should be generated

export function listSongs() {
    return FILES.map((fullName) => ({
        bpm: Number(fullName.substring(0, 3)),
        name: fullName.substring(6, fullName.length - 4),
        fullName,
    }
    ));
}

const FILES = [
    '100 - Rock the Party - Alexi Action.mp3',
];
