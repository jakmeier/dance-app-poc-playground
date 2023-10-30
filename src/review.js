const output = document.getElementById('replay');

export function addRecording(r) {
    output.src = URL.createObjectURL(r);
}