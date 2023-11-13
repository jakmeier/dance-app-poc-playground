export const STEPS =
{
    "running man right": ["right-forward", "left-up"],
    "running man left": ["left-forward", "right-up"],
    "reverse running man right": ["right-forward", "right-up"],
    "reverse running man left": ["left-forward", "left-up"],
};

export const CHOREOS = {
    "Running One": {
        steps: ["running man right", "running man left",],
        turns: [],
        // alt_steps: ["running man left", "running man right"],
    },
    "Turn and Run": {
        steps: ["running man right", "running man left", "running man right", "running man right"],
        turns: [6],
        // alt_steps: 
    }
};
