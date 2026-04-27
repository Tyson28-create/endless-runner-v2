// =========================
// 1. INITIALIZATION & UI
// =========================
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl");
const scoreElement = document.getElementById("score");
const pauseBtn = document.getElementById("pauseBtn");
const gameOverOverlay = document.getElementById("game-over-overlay");
const finalScoreElement = document.getElementById("final-score");

if (!gl) alert("WebGL not supported");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.8, 0.8, 0.8, 1.0);

// =========================
// 2. SHADERS
// =========================
const vsSource = `
attribute vec3 position;
attribute vec2 uv;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
varying vec2 vUV;
void main() {
    vUV = uv;
    gl_Position = uProjection * uView * uModel * vec4(position, 1.0);
}`;

const fsSource = `
precision mediump float;
uniform sampler2D uTexture;
uniform bool useTexture;
uniform vec3 uColor;
varying vec2 vUV;
void main() {
    if (useTexture) {
        gl_FragColor = texture2D(uTexture, vUV);
    } else {
        gl_FragColor = vec4(uColor, 1.0);
    }
}`;

function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

const program = gl.createProgram();
gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
gl.linkProgram(program);
gl.useProgram(program);

const posLoc = gl.getAttribLocation(program, "position");
const uvLoc = gl.getAttribLocation(program, "uv");
const uProj = gl.getUniformLocation(program, "uProjection");
const uView = gl.getUniformLocation(program, "uView");
const uModel = gl.getUniformLocation(program, "uModel");
const uUseTex = gl.getUniformLocation(program, "useTexture");
const uCol = gl.getUniformLocation(program, "uColor");

// =========================
// 3. ASSETS & BUFFERS
// =========================
const carTexture = gl.createTexture();
const carImg = new Image();
carImg.src = "rs3Back.png";
carImg.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, carTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, carImg);
    gl.generateMipmap(gl.TEXTURE_2D);
};

const cubeData = new Float32Array([
    -0.5,-0.5, 0.5, 0,0,  0.5,-0.5, 0.5, 1,0,  0.5, 0.5, 0.5, 1,1, -0.5, 0.5, 0.5, 0,1, 
    -0.5,-0.5,-0.5, 0,0,  0.5,-0.5,-0.5, 1,0,  0.5, 0.5,-0.5, 1,1, -0.5, 0.5,-0.5, 0,1, 
    -0.5, 0.5, 0.5, 0,0,  0.5, 0.5, 0.5, 1,0,  0.5, 0.5,-0.5, 1,1, -0.5, 0.5,-0.5, 0,1  
]);

const cubeIndices = new Uint16Array([
    0,1,2, 0,2,3, 1,5,6, 1,6,2, 5,4,7, 5,7,6, 
    4,0,3, 4,3,7, 3,2,6, 3,6,7, 4,5,1, 4,1,0
]);

const groundData = new Float32Array([
    -5, 0, -120, 0,0,  5, 0, -120, 1,0,  5, 0, 5, 1,1, -5, 0, 5, 0,1
]);

const vbo = gl.createBuffer();
const ibo = gl.createBuffer();

// =========================
// 4. MATH UTILS
// =========================
function identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
function translate(x, y, z) { let m = identity(); m[12]=x; m[13]=y; m[14]=z; return m; }
function scale(x, y, z) { let m = identity(); m[0]=x; m[5]=y; m[10]=z; return m; }
function multiply(a, b) {
    let res = new Float32Array(16);
    for (let i=0; i<4; i++) {
        for (let j=0; j<4; j++) {
            res[j*4+i] = a[i]*b[j*4] + a[i+4]*b[j*4+1] + a[i+8]*b[j*4+2] + a[i+12]*b[j*4+3];
        }
    }
    return res;
}
function perspective(fov, aspect, near, far) {
    let f = 1/Math.tan(fov/2), m = identity();
    m[0]=f/aspect; m[5]=f; m[10]=(far+near)/(near-far); m[11]=-1; m[14]=(2*far*near)/(near-far); m[15]=0;
    return m;
}

// =========================
// 5. GAME STATE & INPUT
// =========================
const lanes = [-2, 0, 2];
let player, obstacles, speed, score, paused, gameOver;

function resetGame() {
    player = { lane: 1, x: 0, z: 0 };
    obstacles = [];
    speed = 0.2;      // Starting speed
    score = 0;
    paused = false;
    gameOver = false;

    gameOverOverlay.style.display = "none";
    pauseBtn.innerText = "Pause";
    scoreElement.innerText = "Score: 0";

    requestAnimationFrame(render);
}

document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "p") togglePause();
    if (paused || gameOver) return;
    if (e.key === "ArrowLeft" || e.key === "a") player.lane = Math.max(0, player.lane - 1);
    if (e.key === "ArrowRight" || e.key === "d") player.lane = Math.min(2, player.lane + 1);
});

pauseBtn.addEventListener("click", togglePause);

function togglePause() {
    if (gameOver) return;
    paused = !paused;
    pauseBtn.innerText = paused ? "Resume" : "Pause";
}

function spawn() {
    if (paused || gameOver) return;
    obstacles.push({ 
        x: lanes[Math.floor(Math.random()*3)], 
        z: -80, // Spawn further away to handle higher speeds
        color: [Math.random(), Math.random(), Math.random()] 
    });
}
setInterval(spawn, 900); // Slightly faster spawn rate

// =========================
// 6. DRAWING
// =========================
function drawMesh(data, indices, mat, useTex, color = [1,1,1]) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

    gl.uniformMatrix4fv(uModel, false, mat);
    gl.uniform1i(uUseTex, useTex ? 1 : 0);
    gl.uniform3fv(uCol, color);

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5*4, 0);

    if (useTex) {
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 5*4, 3*4);
        gl.bindTexture(gl.TEXTURE_2D, carTexture);
    } else {
        gl.disableVertexAttribArray(uvLoc);
    }
    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
}

function render() {
    if (gameOver) {
        gameOverOverlay.style.display = "block";
        finalScoreElement.innerText = "Final Score: " + Math.floor(score);
        return; 
    }

    if (!paused) {
        // Smooth lane switching
        player.x += (lanes[player.lane] - player.x) * 0.2;

        // Move obstacles
        obstacles.forEach(o => {
            o.z += speed;
            // Collision detection
            if (Math.abs(player.x - o.x) < 0.8 && Math.abs(player.z - o.z) < 1.8) {
                gameOver = true;
            }
        });

        obstacles = obstacles.filter(o => o.z < 10);

        // SPEED RAMP: The game gets faster every second
        speed += 0.00008; 
        score += speed * 2; 

        scoreElement.innerText = "Score: " + Math.floor(score) + (paused ? " (PAUSED)" : "");
    }

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uProj, false, perspective(Math.PI/4, canvas.width/canvas.height, 0.1, 150));
    gl.uniformMatrix4fv(uView, false, translate(0, -2.5, -8));

    // Ground (Asphalt)
    drawMesh(groundData, cubeIndices.slice(0, 6), identity(), false, [0.2, 0.2, 0.2]);

    // Obstacles
    obstacles.forEach(o => drawMesh(cubeData, cubeIndices, translate(o.x, 0.5, o.z), false, o.color));

    // Player Car
    const pX = player.x, pZ = player.z;
    drawMesh(cubeData, cubeIndices, multiply(translate(pX, 0.5, pZ), scale(1.2, 0.4, 2.2)), true); 
    drawMesh(cubeData, cubeIndices, multiply(translate(pX, 0.9, pZ - 0.2), scale(0.8, 0.4, 1.2)), true); 
    
    const wheels = [[-0.6, 0.3, 0.7], [0.6, 0.3, 0.7], [-0.6, 0.3, -0.7], [0.6, 0.3, -0.7]];
    wheels.forEach(w => drawMesh(cubeData, cubeIndices, multiply(translate(pX+w[0], w[1], pZ+w[2]), scale(0.3, 0.4, 0.4)), false, [0.05,0.05,0.05]));

    requestAnimationFrame(render);
}

// Initial start
resetGame();
