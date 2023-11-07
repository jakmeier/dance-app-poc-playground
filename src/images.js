
export const IMAGES = {
    between_steps: require("url:../assets/image/between_steps.png"),
    step_wide: require("url:../assets/image/step_wide.png"),
};

export function loadImage(url) {
    const img = new window.Image();
    img.src = url;
    return img;
}
