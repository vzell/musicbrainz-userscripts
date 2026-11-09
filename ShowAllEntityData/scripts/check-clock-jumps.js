'use strict';

/**
 * Checks whether this machine's wall clock jumps.
 *
 *   node scripts/check-clock-jumps.js [seconds]     (default 30)
 *
 * Every 100 ms it compares how far the wall clock (`Date.now()`) moved with
 * how far the monotonic clock (`process.hrtime`) moved. A difference over
 * 200 ms is a JUMP of the wall clock (a time sync stepping it), as opposed
 * to a STALL, where both move together. Exit code 0: no jump; 1: jumps seen.
 *
 * Why it exists (DEBUG-NOTES.md 2026-11-09, "petri's clock spikes"): after
 * 10 days powered off, petri's WSL2 clock jumped 16.8 s ahead for ~100 ms
 * every ~5 s — Hyper-V's time samples against systemd-timesyncd, with the
 * Windows time service not syncing. Anything that schedules on `Date.now()`
 * then waited 16.8 s too long, and 16-23 link-preview specs failed per
 * loaded run while looking "flaky under load". Run this first when a
 * freshly booted machine shows timing failures that pass when rerun alone.
 * Fix on WSL: `sudo systemctl disable --now systemd-timesyncd` (WSL takes
 * its time from Windows), and make Windows sync (`w32tm /query /status`
 * must name an NTP source); see tests/README.org.
 */

const seconds = Number(process.argv[2]) || 30;

/**
 * The monotonic clock, ms.
 *
 * @returns {number}
 */
function monoMs() {
    return Number(process.hrtime.bigint() / 1000000n);
}

/**
 * Samples both clocks every 100 ms for `secs` seconds, prints each jump and
 * stall, then a summary, and sets the exit code.
 *
 * @param {number} secs
 * @returns {void}
 */
function run(secs) {
    const startMono = monoMs();
    let lastWall = Date.now();
    let lastMono = startMono;
    let jumps = 0;
    let stalls = 0;
    const iv = setInterval(() => {
        const wall = Date.now();
        const mono = monoMs();
        const dWall = wall - lastWall;
        const dMono = mono - lastMono;
        if (Math.abs(dWall - dMono) > 200) {
            jumps++;
            console.log(`${new Date(wall).toISOString()}  wall +${dWall} ms, monotonic +${dMono} ms: jump ${dWall - dMono} ms`);
        } else if (dMono > 1000) {
            stalls++;
            console.log(`${new Date(wall).toISOString()}  stall: both clocks +${dMono} ms`);
        }
        lastWall = wall;
        lastMono = mono;
        if (mono - startMono >= secs * 1000) {
            clearInterval(iv);
            console.log(`${jumps} jump(s), ${stalls} stall(s) in ${secs} s` + (jumps ? ' — the wall clock is being stepped' : ' — the clock is steady'));
            process.exitCode = jumps ? 1 : 0;
        }
    }, 100);
}

run(seconds);
