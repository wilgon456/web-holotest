/* === Three.js 기본 설정 === */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

// 카메라 및 렌더러 설정
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('viewer').appendChild(renderer.domElement);

// 조명 추가
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 10, 10);
scene.add(directionalLight);

// glTF 모델 로드
let model;
const loader = new THREE.GLTFLoader();
loader.load(
  './shiba.glb',
  (gltf) => {
    model = gltf.scene;
    scene.add(model);
  },
  undefined,
  (error) => {
    console.error('모델 로드 중 오류 발생:', error);
  }
);

// 카메라 초기 위치 설정
camera.position.z = 5;

/* === MediaPipe Hands 설정 === */
const videoElement = document.getElementById('input_video');
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5
});
hands.onResults(onResults);

const mpCamera = new Camera(videoElement, {
  onFrame: async () => {
    await hands.send({ image: videoElement });
  },
  width: 640,
  height: 480
});
mpCamera.start();

/* === 전역 변수 및 상태 === */
let controlMode = "cursor"; 
let lastModeChangeTime = 0; 
let sevenGestureStartTime = null; 
const holdTimeForModeChange = 1000;
let initialPinchDistance = null;
let modelScale = 1;
let lastPointerX = null;
let lastPointerY = null;
let pointerStillTime = null;
const clickHoldTime = 5000; // 5초 동안 멈춰있으면 클릭 발생

/* === 포인터 생성 === */
const pointer = document.createElement('div');
pointer.id = 'pointer';
document.body.appendChild(pointer);

/* === 포인터 CSS 설정 === */
pointer.style.position = "absolute";
pointer.style.width = "20px";
pointer.style.height = "20px";
pointer.style.backgroundColor = "red";
pointer.style.borderRadius = "50%";
pointer.style.zIndex = "1000";
pointer.style.pointerEvents = "none";
pointer.style.display = "none";

/* === 상태창 가져오기 === */
const statusBox = document.getElementById('statusBox');

/* === 손 추적 결과 처리 === */
function onResults(results) {
  console.log("손 인식 데이터 수신:", results.multiHandLandmarks);
  let handsCount = results.multiHandLandmarks.length;

  // === 양손이 주먹을 쥐었을 때 모드 변경 ===
  if (handsCount === 2) {
    let rightHand = results.multiHandLandmarks[0];
    let leftHand = results.multiHandLandmarks[1];

    if (rightHand && leftHand) {
      function isFist(hand) {
        return (
          hand[8].y > hand[6].y &&  // 검지 손가락이 두 번째 마디보다 아래
          hand[12].y > hand[10].y && // 중지 손가락이 두 번째 마디보다 아래
          hand[16].y > hand[14].y && // 약지 손가락이 두 번째 마디보다 아래
          hand[20].y > hand[18].y    // 새끼 손가락이 두 번째 마디보다 아래
        );
      }

      let isRightFist = isFist(rightHand);
      let isLeftFist = isFist(leftHand);

      console.log(`오른손 주먹 감지: ${isRightFist}, 왼손 주먹 감지: ${isLeftFist}`);

      if (isRightFist && isLeftFist) {
        if (!sevenGestureStartTime) {
          sevenGestureStartTime = Date.now();
          console.log("주먹 감지 시작:", sevenGestureStartTime);
        } else if (Date.now() - sevenGestureStartTime > holdTimeForModeChange) {
          controlMode = controlMode === "cursor" ? "model" : "cursor";
          console.log(`모드 변경됨: ${controlMode}`);

          if (statusBox) {
            statusBox.textContent = `현재 모드: ${controlMode}`;
            statusBox.style.backgroundColor = controlMode === "cursor" ? "red" : "blue";
          } else {
            console.warn("상태창이 존재하지 않습니다.");
          }

          sevenGestureStartTime = null; // 모드 변경 후 초기화
        }
      } else {
        sevenGestureStartTime = null; // 손을 풀면 타이머 초기화
      }
    }
  } else {
    sevenGestureStartTime = null; // 한 손만 감지되면 초기화
  }

  // === 기존 커서 및 모델 조작 코드 유지 ===
  if (controlMode === "cursor" && handsCount > 0) {
    pointer.style.display = "block";
    pointer.style.opacity = "1";

    const hand = results.multiHandLandmarks[0];
    if (hand[8]) {
      let pointerX = (1 - hand[8].x) * window.innerWidth;
      let pointerY = hand[8].y * window.innerHeight;

      pointerX = Math.min(Math.max(pointerX, 0), window.innerWidth - 20);
      pointerY = Math.min(Math.max(pointerY, 0), window.innerHeight - 20);

      pointer.style.left = `${pointerX}px`;
      pointer.style.top = `${pointerY}px`;

      console.log("포인터 위치 업데이트:", pointer.style.left, pointer.style.top);

      // === 커서 멈춤 감지 ===
      if (lastPointerX !== null && lastPointerY !== null) {
        let moveDistance = Math.sqrt(
          Math.pow(pointerX - lastPointerX, 2) + Math.pow(pointerY - lastPointerY, 2)
        );

        if (moveDistance < 10) { // 5px 이하로 움직이면 멈춰있다고 판단
          if (!pointerStillTime) {
            pointerStillTime = Date.now();
          } else if (Date.now() - pointerStillTime > clickHoldTime) {
            console.log("🖱 자동 클릭 발생!");
            triggerClick(pointerX, pointerY);
            pointerStillTime = null; // 클릭 후 초기화
          }
        } else {
          pointerStillTime = null; // 움직이면 타이머 초기화
        }
      }

      lastPointerX = pointerX;
      lastPointerY = pointerY;
    }
  } else {
    pointer.style.display = "none";
    pointerStillTime = null;
  }

  // === 모델 조작 모드 (회전 + 확대/축소) ===
  if (controlMode === "model" && handsCount > 0) {
    if (!model) {
      console.warn("모델이 아직 로드되지 않았습니다.");
      return;
    }

    console.log("모델 조작 실행됨");
    const hand = results.multiHandLandmarks[0];
    const wrist = hand[0];

    if (wrist) {
      let rotationY = (wrist.x - 0.5) * Math.PI * 2;
      let rotationX = (wrist.y - 0.5) * Math.PI;

      model.rotation.y = rotationY;
      model.rotation.x = rotationX;
    }

    // === 모델 확대/축소 감지 ===
    if (hand[4] && hand[8]) {
      let pinchDistance = Math.sqrt(
        Math.pow(hand[4].x - hand[8].x, 2) + Math.pow(hand[4].y - hand[8].y, 2)
      );

      if (initialPinchDistance === null) {
        initialPinchDistance = pinchDistance;
      } else {
        let scaleFactor = pinchDistance / initialPinchDistance;
        modelScale = Math.min(Math.max(modelScale * scaleFactor, 0.5), 3);
        model.scale.set(modelScale, modelScale, modelScale);
        console.log(`모델 크기 조정: ${modelScale}`);
      }
    } else {
      initialPinchDistance = null;
    }
  }
}

/* === 클릭 이벤트 실행 함수 === */
function triggerClick(x, y) {
  const event = new MouseEvent("click", {
    view: window,
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y
  });

  document.elementFromPoint(x, y)?.dispatchEvent(event);
}

/* === 애니메이션 루프 === */
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
