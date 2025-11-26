document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    const canvas = document.getElementById('videoCanvas');
    const ctx = canvas.getContext('2d');
    let isStreaming = false;

    // Set canvas size
    canvas.width = 640;
    canvas.height = 480;

    function drawFrame(imageData) {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = imageData;
    }

    // Handle connection events
    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        isStreaming = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        isStreaming = false;
    });

    // Start camera when button is clicked
    window.startCamera = function() {
        if (!isStreaming) {
            console.log('Requesting camera stream...');
            socket.emit('start-stream');
            isStreaming = true;
        }
    };

    // Handle incoming video frames with pose detection
    socket.on('video-frame', (data) => {
        try {
            if (data && data.frame) {
                const imageData = `data:image/jpeg;base64,${data.frame}`;
                drawFrame(imageData);
            } else {
                console.error('Invalid frame data received:', data);
            }
        } catch (error) {
            console.error('Error processing video frame:', error);
        }
    });


        // --- rep-count handler with: count-first-rep-as-1, snackbar, localStorage persistence ---
    socket.on('rep-count', (data) => {
        try {
            if (!data) return;
            let count = null;
            if (typeof data === 'number') {
                count = data;
            } else if (data && typeof data.count !== 'undefined') {
                count = data.count;
            }

            // Defensive: coerce to number if possible
            if (count !== null) count = Number(count);

            console.log('[rep-debug] received rep-count ->', count);

            // Restore persisted state if available
            if (typeof window.lastRepTime === 'undefined') {
                const persistedTime = localStorage.getItem('lastRepTime');
                window.lastRepTime = persistedTime ? Number(persistedTime) : null;
            }
            if (typeof window.lastRepCount === 'undefined') {
                const persistedCount = localStorage.getItem('lastRepCount');
                window.lastRepCount = persistedCount ? Number(persistedCount) : null;
            }
            if (typeof window.currentSets === 'undefined') {
                const persistedSets = localStorage.getItem('currentSets');
                window.currentSets = persistedSets ? Number(persistedSets) : 1;
            }
            if (typeof window.currentReps === 'undefined') window.currentReps = 0;

            // Only update on valid numeric counts
            if (typeof count === 'number' && isFinite(count)) {
                const now = Date.now();

                // If this is the very first rep we have seen, just set values
                if (window.lastRepCount === null) {
                    window.lastRepCount = count;
                    window.lastRepTime = now;
                    window.currentReps = count;
                    // persist
                    localStorage.setItem('lastRepTime', String(window.lastRepTime));
                    localStorage.setItem('lastRepCount', String(window.lastRepCount));
                    localStorage.setItem('currentSets', String(window.currentSets));
                    if (typeof window.updateReps === 'function') window.updateReps(window.currentReps);
                    else if (typeof renderCounters === 'function') renderCounters();
                    return;
                }

                // If rep count increased -> a new rep was detected
                if (count > window.lastRepCount) {
                    const diffMs = (window.lastRepTime ? (now - window.lastRepTime) : Infinity);

                    // If gap > 2 minutes -> treat as new set: increment sets and set reps = 1
                    if (diffMs > 2 * 60 * 1000) {
                        window.currentSets = (window.currentSets || 1) + 1;
                        window.currentReps = 1; // first rep of the new set counts as 1
                        showSnackbar(`New set started — Sets: ${window.currentSets}`);
                        console.log(`[rep-debug] gap ${Math.round(diffMs/1000)}s > 120s: increment sets -> ${window.currentSets}, set reps -> 1`);
                    } else {
                        // Normal case: continue counting reps within same set
                        window.currentReps = count;
                    }

                    // update last seen
                    window.lastRepCount = count;
                    window.lastRepTime = now;

                    // persist
                    localStorage.setItem('lastRepTime', String(window.lastRepTime));
                    localStorage.setItem('lastRepCount', String(window.lastRepCount));
                    localStorage.setItem('currentSets', String(window.currentSets));

                    // Update UI
                    if (typeof window.updateReps === 'function') window.updateReps(window.currentReps);
                    else if (typeof renderCounters === 'function') renderCounters();

                } else {
                    // count did not increase — no new rep. Do nothing
                }
            } else {
                // Non-numeric count -> reset to 0 to be safe
                window.currentReps = 0;
                if (typeof window.updateReps === 'function') window.updateReps(window.currentReps);
                else if (typeof renderCounters === 'function') renderCounters();
            }
        } catch (err) {
            console.error('Error processing rep-count event:', err);
        }
    });
    


    // Handle errors
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        isStreaming = false;
    });
});
