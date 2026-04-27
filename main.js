const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl");

// Helper to handle resizing for mobile screens
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.1, 0.1, 0.1, 1.0);

// --- SHADERS ---
const vs = `attribute vec3 p; attribute vec2 uv; uniform mat4 pr, vi, mo; varying vec2 vU; void main(){ vU=uv; gl_Position=pr*vi*mo*vec4(p,1); }`;
const fs = `precision mediump float; uniform sampler2D t; uniform bool ut; uniform vec3 c; varying vec2 vU; void main(){ gl_FragColor = ut ? texture2D(t, vU) : vec4(c,1); }`;

function createS(t, s) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); return sh; }
const prog = gl.createProgram();
gl.attachShader(prog, createS(gl.VERTEX_SHADER, vs));
gl.attachShader(prog, createS(gl.FRAGMENT_SHADER, fs));
gl.linkProgram(prog);
gl.useProgram(prog);

const pL = gl.getAttribLocation(prog, "p"), uL = gl.getAttribLocation(prog, "uv");
const prU = gl.getUniformLocation(prog, "pr"), viU = gl.getUniformLocation(prog, "vi"), moU = gl.getUniformLocation(prog, "mo");
const utU = gl.getUniformLocation(prog, "ut"), cU = gl.getUniformLocation(prog, "c");

// --- BUFFERS & TEXTURE ---
const tex = gl.createTexture();
const img = new Image();
img.src = "rs3Back.png";
img.onload = () => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); gl.generateMipmap(gl.TEXTURE_2D); };

const cube = new Float32Array([-0.5,-0.5,0.5,0,0, 0.5,-0.5,0.5,1,0, 0.5,0.5,0.5,1,1, -0.5,0.5,0.5,0,1, -0.5,-0.5,-0.5,0,0, 0.5,-0.5,-0.5,1,0, 0.5,0.5,-0.5,1,1, -0.5,0.5,-0.5,0,1]);
const ind = new Uint16Array([0,1,2,0,2,3, 1,5,6,1,6,2, 5,4,7,5,7,6, 4,0,3,4,3,7, 3,2,6,3,6,7, 4,5,1,4,1,0]);
const vbo = gl.createBuffer(), ibo = gl.createBuffer();

// --- MATH ---
function mP(f, a, n, fa) { let s = 1/Math.tan(f/2); return [s/a,0,0,0, 0,s,0,0, 0,0,(fa+n)/(n-fa),-1, 0,0,(2*fa*n)/(n-fa),0]; }
function mTr(x, y, z) { return [1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]; }

let lanes = [-2, 0, 2], player, obstacles, speed, score, paused, over;

function resetGame() {
    player = { lane: 1, x: 0 }; obstacles = []; speed = 0.2; score = 0; paused = false; over = false;
    document.getElementById("overlay").style.display = "none";
    requestAnimationFrame(draw);
}

function togglePause() { if(!over) paused = !paused; document.getElementById("pauseBtn").innerText = paused ? "Resume" : "Pause"; }

// =========================
// MOBILE & DESKTOP CONTROLS
// =========================

// 1. Keyboard (Desktop)
document.addEventListener("keydown", e => {
    if(e.key === 'a' || e.key === 'ArrowLeft') moveLeft();
    if(e.key === 'd' || e.key === 'ArrowRight') moveRight();
});

// 2. Touch (Mobile)
canvas.addEventListener("touchstart", e => {
    e.preventDefault(); // Prevents zooming/scrolling while playing
    const touchX = e.touches[0].clientX;
    const screenWidth = window.innerWidth;

    if (touchX < screenWidth / 2) moveLeft();
    else moveRight();
}, { passive: false });

function moveLeft() { if(!paused && !over) player.lane = Math.max(0, player.lane - 1); }
function moveRight() { if(!paused && !over) player.lane = Math.min(2, player.lane + 1); }

setInterval(() => { if(!paused && !over) obstacles.push({x: lanes[Math.floor(Math.random()*3)], z: -60, c: [Math.random(), Math.random(), Math.random()]}); }, 800);

// --- RENDER ---
function drawM(m, ut, c=[1,1,1]) {
    gl.uniformMatrix4fv(moU, false, m); gl.uniform1i(utU, ut); gl.uniform3fv(cU, c);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, cube, gl.STATIC_DRAW);
    gl.vertexAttribPointer(pL, 3, gl.FLOAT, false, 5*4, 0); gl.enableVertexAttribArray(pL);
    if(ut) { gl.vertexAttribPointer(uL, 2, gl.FLOAT, false, 5*4, 3*4); gl.enableVertexAttribArray(uL); gl.bindTexture(gl.TEXTURE_2D, tex); } 
    else { gl.disableVertexAttribArray(uL); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ind, gl.STATIC_DRAW);
    gl.drawElements(gl.TRIANGLES, ind.length, gl.UNSIGNED_SHORT, 0);
}

function draw() {
    if(over) { document.getElementById("overlay").style.display = "block"; document.getElementById("finalScore").innerText = "Score: " + Math.floor(score); return; }
    if(!paused) {
        player.x += (lanes[player.lane] - player.x) * 0.15;
        obstacles.forEach(o => { 
            o.z += speed; 
            if(Math.abs(player.x - o.x) < 0.8 && Math.abs(o.z) < 1.2) over = true; 
        });
        obstacles = obstacles.filter(o => o.z < 10);
        speed += 0.00006; score += speed; 
        document.getElementById("ui").innerText = "Score: " + Math.floor(score);
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(prU, false, mP(Math.PI/4, canvas.width/canvas.height, 0.1, 150));
    gl.uniformMatrix4fv(viU, false, mTr(0, -2.5, -12)); // Slightly tilted camera for better mobile view

    drawM(mTr(0,-0.5,-30), false, [0.2, 0.2, 0.2]); // Ground
    obstacles.forEach(o => drawM(mTr(o.x, 0, o.z), false, o.c)); // Obstacles
    drawM(mTr(player.x, 0, 0), true); // Car

    requestAnimationFrame(draw);
}

resetGame();
