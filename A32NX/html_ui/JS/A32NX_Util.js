const A32NX_Util = {};

A32NX_Util.createDeltaTimeCalculator = (startTime = Date.now()) => {
    let lastTime = startTime;

    return () => {
        const nowTime = Date.now();
        const deltaTime = nowTime - lastTime;
        lastTime = nowTime;

        return deltaTime;
    };
};

A32NX_Util.createFrameCounter = (interval = 5) => {
    let count = 0;
    return () => {
        const c = count++;
        if (c == interval) {
            count = 0;
        }
        return c;
    };
};

A32NX_Util.createMachine = (machineDef) => {
    const machine = {
        value: machineDef.init,
        action(event) {
            const currStateDef = machineDef[machine.value];
            const destTransition = currStateDef.transitions[event];
            if (!destTransition) {
                return;
            }
            const destState = destTransition.target;

            machine.value = destState;
        },
        setState(newState) {
            const valid = machineDef[newState];
            if (valid) {
                machine.value = newState;
            }
        }
    };
    return machine;
};

/**
 * Utility class to throttle instrument updates
 */
class UpdateThrottler {

    /**
     * @param {number} intervalMs Interval between updates, in milliseconds
     */
    constructor(intervalMs) {
        this.intervalMs = intervalMs;
        this.currentTime = 0;
        this.lastUpdateTime = 0;

        // Take a random offset to space out updates from different instruments among different
        // frames as much as possible.
        this.refreshOffset = Math.floor(Math.random() * intervalMs);
        this.refreshNumber = 0;
    }

    /**
     * Checks whether the instrument should be updated in the current frame according to the
     * configured update interval.
     *
     * @param {*} deltaTime
     * @returns -1 if the instrument should not update, or the time elapsed since the last
     *          update in milliseconds
     */
    canUpdate(deltaTime) {
        this.currentTime += deltaTime;
        const number = Math.floor((this.currentTime + this.refreshOffset) / this.intervalMs);
        const update = number > this.refreshNumber;
        this.refreshNumber = number;
        if (update) {
            const accumulatedDelta = this.currentTime - this.lastUpdateTime;
            this.lastUpdateTime = this.currentTime;
            return accumulatedDelta;
        } else {
            return -1;
        }
    }
}

class Tracer {

    constructor() {
        this.enabled = true;
        this.names = [];
        this.events = [];
        this.refreshNumber = 0;
        this.pid = "(not set)";
    }

    setPid(pid) {
        this.pid = pid;
    }

    begin(name) {
        if (!this.enabled) {
            return;
        }
        this.names.push(name)
        this.events.push({"name": name, "cat": "PERF", "ph": "B", "pid":this.pid, "tid": this.pid, "ts": window.performance.now() * 1000});
    }

    end() {
        if (!this.enabled) {
            return;
        }
        if (this.names.length === 0) {
            return;
        }
        let name = this.names.pop();
        this.events.push({"name": name, "cat": "PERF", "ph": "E", "pid": this.pid, "tid": this.pid, "ts": window.performance.now() * 1000});
    }

    postPeriodically() {
        if (!this.enabled) {
            return;
        }
        let d = new Date();
        let t = d.getTime();
        const number = Math.floor(t / 10000);
        const update = number > this.refreshNumber;
        this.refreshNumber = number;
        if (update) {
            this.post();
        }
    }

    post() {
        fetch("http://127.0.0.1:5000/ping", {
            mode: 'cors',
            method: 'GET'
        }).then((response) => {
            if (response.status !== 501) {
                this.events = [];
                return;
            }
            console.log("Tracing active");
            const dataToSend = JSON.stringify(this.events);
            fetch("http://127.0.0.1:5000/collect?instrument=" + this.pid, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: dataToSend
            }).then((response) => {
                console.log("Posted data!");
            }).catch((reason) => {
                console.log("Failed! " + reason);
            });
            this.events = [];
        }).catch((error) => {
            this.events = [];
        });
    }
}

tracer = new Tracer();

var origSetInterval = window.setInterval;
window.setInterval = function(func, time, args) {
    return origSetInterval((arg) => {
        tracer.begin("interval");
        func(arg);
        tracer.end();
    }, time, args);
}

var origRequestAnimationFrame = window.requestAnimationFrame;
window.requestAnimationFrame = function(callback) {
    return origRequestAnimationFrame((number) => {
        tracer.begin("anim");
        callback(number);
        tracer.end();
    });
}

var origSetTimeout = window.setTimeout;
window.setTimeout = function(func, time, args) {
    return origSetTimeout((arg) => {
        tracer.begin("timeout");
        func(arg);
        tracer.end();
    }, time, args);
}

/*var origCoherentOn = Coherent.on;
Coherent.on = function(name, func, context) {
    return origCoherentOn(name, (args) => {
        tracer.begin("Coherent.on" + name);
        func(args);
        tracer.end();
    }, context);
}

var origCoherentCall = Coherent.call;
Coherent.call = function(name, ...args) {
    let promise = origCoherentCall(name, args);
    return new Promise(function(resolve, reject) {
        promise.then((args) => {
            tracer.begin("Coherent.callback" + name);
            resolve(args);
            tracer.end();
        }).catch((args) => {
            tracer.begin("Coherent.callbackFail" + name);
            reject(args);
            tracer.end();
        });
    });
}*/
