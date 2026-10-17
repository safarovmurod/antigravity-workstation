
(() => {
	const rawConfig = {
		fallbackColor: '#8fd3ff',
		fastSpeed: 0.42,
		midSpeed: 0.24,
		slowSpeed: 0.1,
		axisBias: 0.45,
		twistBoost: 0.16,
		minAlpha: 0.03,
		cursorColor: "#ffffff",
		glowColor: "#ffffff",
		glowEnabled: false,
		glowOpacity: 0.9,
		glowIntensity: 1.8,
		glowSize: 18,
		animationMode: "off",
		maxJumpAnimationDistance: 0,
		effectPreset: "custom",
		shapeStyle: "native",
		trailEnabled: false,
		trailLength: 5,
		trailOpacity: 0.35,
		springEnabled: false,
		springStiffness: 0.16,
		springDamping: 0.78,
		rainbowEnabled: false,
		gradientEnabled: false,
		rippleEnabled: false,
		landingPulseEnabled: false,
		sparkEnabled: false,
		sparkAmount: 0.5,
	};

	const presetEffects = {
		minimal: {
			trailEnabled: false,
			trailLength: 0,
			springEnabled: false,
			glowEnabled: false,
			rainbowEnabled: false,
			gradientEnabled: false,
			rippleEnabled: false,
			landingPulseEnabled: false,
			sparkEnabled: false,
		},
		neon: {
			trailEnabled: true,
			trailLength: 5,
			trailOpacity: 0.38,
			springEnabled: true,
			springStiffness: 0.18,
			springDamping: 0.74,
			glowEnabled: true,
			glowIntensity: 2.3,
			glowSize: 26,
			glowOpacity: 1,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.5,
			gradientEnabled: true,
		},
		aurora: {
			trailEnabled: true,
			trailLength: 8,
			trailOpacity: 0.32,
			springEnabled: true,
			springStiffness: 0.15,
			springDamping: 0.8,
			glowEnabled: true,
			glowIntensity: 2,
			glowSize: 30,
			rainbowEnabled: true,
			gradientEnabled: true,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.5,
		},
		matrix: {
			cursorColor: '#00ff41',
			glowColor: '#00ff41',
			trailEnabled: false,
			trailLength: 0,
			glowEnabled: true,
			glowIntensity: 2.6,
			glowSize: 22,
			gradientEnabled: true,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 0.7,
			shapeStyle: 'native',
		},
		comet: {
			trailEnabled: true,
			trailLength: 12,
			trailOpacity: 0.55,
			springEnabled: true,
			springStiffness: 0.2,
			springDamping: 0.7,
			glowEnabled: true,
			glowIntensity: 1.8,
			glowSize: 24,
			rippleEnabled: true,
			landingPulseEnabled: true,
			sparkEnabled: true,
			sparkAmount: 1,
		},
	};

	const config = {
		...rawConfig,
		...(presetEffects[rawConfig.effectPreset] || {}),
	};

	const style = document.createElement('style');
	style.textContent = [
		'.jelly-cursor-layer {',
		'	position: fixed;',
		'	inset: 0;',
		'	pointer-events: none;',
		'	z-index: 2147483647;',
		'	overflow: visible;',
		'}',
		'.jelly-cursor-svg {',
		'	position: absolute;',
		'	inset: 0;',
		'	width: 100%;',
		'	height: 100%;',
		'	overflow: visible;',
		'	pointer-events: none;',
		'}',
		'/* Monaco native cursor preserved for line-thin */',
	].join('\n');
	document.head.appendChild(style);

	const overlay = createOverlay();
	const states = [];
	const stateByCursor = new Map();
	const effects = [];
	let frameId = 0;
	let nextCursorId = 0;

	function createOverlay() {
		const layer = document.createElement('div');
		layer.className = 'jelly-cursor-layer';
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.classList.add('jelly-cursor-svg');
		layer.appendChild(svg);

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
		gradient.setAttribute('id', 'jellyCursorCursorGradient');
		gradient.setAttribute('x1', '0');
		gradient.setAttribute('y1', '0');
		gradient.setAttribute('x2', '0');
		gradient.setAttribute('y2', '1');
		const topStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		topStop.setAttribute('offset', '0%');
		const bottomStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
		bottomStop.setAttribute('offset', '100%');
		gradient.appendChild(topStop);
		gradient.appendChild(bottomStop);
		defs.appendChild(gradient);
		svg.appendChild(defs);
		document.body.appendChild(layer);

		return {
			layer,
			svg,
			gradient,
			topStop,
			bottomStop,
		};
	}

	function getOrCreateCursorState(cursor, targetPoints, seen) {
		let cursorKey = cursor.dataset.jellyCursorId;

		if (!cursorKey) {
			cursorKey = 'jelly-cursor-' + (++nextCursorId);
			cursor.dataset.jellyCursorId = cursorKey;
		}

		let state = stateByCursor.get(cursorKey);

		if (!state) {
			state = createCursorState();
			states.push(state);
			state.cursorKey = cursorKey;
			stateByCursor.set(cursorKey, state);

			const nearestState = findNearestStartedState(targetPoints, seen);
			state.points = nearestState ? clonePoints(nearestState.points) : clonePoints(targetPoints);
			state.started = true;
		} else if (state.missedFrames > 0 && state.lastVisiblePoints.length === 4) {
			state.points = clonePoints(state.lastVisiblePoints);
			state.velocity = [];
			state.trail = [];
			state.trailFade = 0;
			state.lastTrailCenter = null;
			state.justLanded = true;
		}

		return state;
	}

	function createCursorState() {
		const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		shape.setAttribute('vector-effect', 'non-scaling-stroke');
		shape.setAttribute('fill-rule', 'nonzero');
		overlay.svg.appendChild(shape);

		return {
			shape,
			cursorKey: null,
			editor: null,
			targetX: 0,
			targetY: 0,
			width: 2,
			height: 18,
			visual: null,
			movement: 0,
			started: false,
			points: [],
			lastVisiblePoints: [],
			velocity: [],
			trail: [],
			trailPaths: [],
			trailFade: 0,
			lastTrailCenter: null,
			justLanded: false,
			missedFrames: 0,
			seen: 0,
		};
	}

	function updateTargets() {
		const seen = ++frameId;
		const cursors = Array.from(document.querySelectorAll('.monaco-editor .cursors-layer .cursor'))
			.filter((cursor) => {
				const editor = cursor.closest('.monaco-editor');
				const rect = cursor.getBoundingClientRect();

				return editor && isVisible(editor) && isInsideViewport(rect) && rect.width > 0 && rect.height > 0;
			})
			.sort(compareCursors);

		for (const cursor of cursors) {
			const editor = cursor.closest('.monaco-editor');

			if (!editor) {
				continue;
			}

			const cursorRect = cursor.getBoundingClientRect();
			const x = cursorRect.left;
			const y = cursorRect.top;
			const width = cursorRect.width;
			const height = cursorRect.height;

			if (!Number.isFinite(x) || !Number.isFinite(y) || height <= 0) {
				continue;
			}

			const targetPoints = getBoxPoints(x, y, width, height);
			const state = getOrCreateCursorState(cursor, targetPoints, seen);

			state.editor = editor;
			state.targetX = x;
			state.targetY = y;
			state.width = width;
			state.height = height;
			state.visual = readCursorVisual(cursor);
			state.seen = seen;
			state.missedFrames = 0;
		}
	}

	function compareCursors(left, right) {
		const leftEditor = left.closest('.monaco-editor');
		const rightEditor = right.closest('.monaco-editor');
		const activeEditor = document.querySelector('.monaco-editor.focused') || document.activeElement?.closest?.('.monaco-editor');

		if (leftEditor === activeEditor && rightEditor !== activeEditor) {
			return -1;
		}

		if (rightEditor === activeEditor && leftEditor !== activeEditor) {
			return 1;
		}

		const leftRect = left.getBoundingClientRect();
		const rightRect = right.getBoundingClientRect();

		return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
	}

	let animating = false;
	let lastFrameTimestamp = 0;

	function tick(timestamp) {
		if (effects.length === 0) {
			animating = false;
			lastFrameTimestamp = 0;
			return;
		}

		const now = typeof timestamp === 'number' ? timestamp : Date.now();
		const dt = clampValue(lastFrameTimestamp ? now - lastFrameTimestamp : 16.7, 0, 50);
		lastFrameTimestamp = now;

		updateEffects(dt);

		if (effects.length > 0) {
			requestAnimationFrame(tick);
		} else {
			animating = false;
			lastFrameTimestamp = 0;
		}
	}

	function pushCursorTrail(state, points) {
		const center = getCenter(points);

		if (state.lastTrailCenter && Math.hypot(center.x - state.lastTrailCenter.x, center.y - state.lastTrailCenter.y) < 1.5) {
			return;
		}

		state.trail.unshift(clonePoints(points));

		if (state.trail.length > config.trailLength) {
			state.trail.pop();
		}

		state.lastTrailCenter = center;
	}

	function getCornerLeadFactors(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);

		if (distance < 0.01) {
			return currentPoints.map(() => 0);
		}

		const direction = { x: dx / distance, y: dy / distance };
		const tangent = { x: -direction.y, y: direction.x };
		const twistScale = Math.min(1, distance / 30);

		return currentPoints.map((point) => {
			const cornerVector = getCornerVector(point, currentCenter);
			const diagonalLead = dot(cornerVector, direction);
			const axisLead = getAxisLead(cornerVector, direction);
			const lead = clampValue(diagonalLead * (1 - config.axisBias) + axisLead * config.axisBias, -1, 1);
			const twist = -dot(cornerVector, tangent) * config.twistBoost * 0.45 * twistScale;

			return clampValue(lead + twist, -1, 1);
		});
	}

	function springStep(state, currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);
		const direction = distance < 0.01 ? { x: 0, y: 0 } : { x: dx / distance, y: dy / distance };
		const leadFactors = getCornerLeadFactors(currentPoints, targetPoints);
		const maxStretch = clampValue(Math.max(state.width, state.height, 8) * 0.9, 6, 30);
		const stretch = Math.min(distance * 0.25, maxStretch);
		const velocity = state.velocity.length === 4
			? state.velocity
			: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];

		const nextPoints = currentPoints.map((point, index) => {
			const shiftedTarget = {
				x: targetPoints[index].x + direction.x * leadFactors[index] * stretch,
				y: targetPoints[index].y + direction.y * leadFactors[index] * stretch,
			};
			const currentVelocity = velocity[index];
			const nextVelocity = {
				x: (currentVelocity.x + (shiftedTarget.x - point.x) * config.springStiffness) * config.springDamping,
				y: (currentVelocity.y + (shiftedTarget.y - point.y) * config.springStiffness) * config.springDamping,
			};

			return {
				x: point.x + nextVelocity.x,
				y: point.y + nextVelocity.y,
			};
		});

		state.velocity = nextPoints.map((point, index) => ({
			x: point.x - currentPoints[index].x,
			y: point.y - currentPoints[index].y,
		}));

		return nextPoints;
	}

	function createEffectCircle(x, y, radius) {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(x));
		circle.setAttribute('cy', String(y));
		circle.setAttribute('r', String(radius));
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', config.fallbackColor || '#8fd3ff');
		circle.setAttribute('stroke-width', '1');
		circle.setAttribute('pointer-events', 'none');
		overlay.svg.appendChild(circle);

		return circle;
	}

	function spawnRipple(x, y) {
		if (!config.rippleEnabled || config.animationMode === 'off') {
			return;
		}

		// Safe limit: maximum 4 concurrent ripples (remove oldest immediately on rapid click)
		while (effects.length >= 4) {
			const oldest = effects.shift();
			if (oldest && oldest.element) {
				oldest.element.remove();
			}
		}

		const initialRadius = 3;
		const circle = createEffectCircle(x, y, initialRadius);
		circle.setAttribute('stroke-width', '1');
		circle.setAttribute('stroke', config.fallbackColor || '#8fd3ff');
		circle.setAttribute('fill', 'none');
		circle.setAttribute('opacity', '0.06');

		effects.push({
			kind: 'ripple',
			element: circle,
			x,
			y,
			startRadius: 3,
			maxRadius: 11,
			radius: 3,
			life: 1,
		});

		if (!animating) {
			animating = true;
			lastFrameTimestamp = 0;
			requestAnimationFrame(tick);
		}
	}

	function spawnLandingPulse(center) {
		if (config.animationMode === 'off') {
			return;
		}

		const circle = createEffectCircle(center.x, center.y, 6);
		circle.setAttribute('fill', withAlpha(config.glowColor || config.fallbackColor, 0.16));
		effects.push({
			kind: 'pulse',
			element: circle,
			x: center.x,
			y: center.y,
			radius: 6,
			speed: 2.2,
			life: 1,
		});
	}

	function spawnSparks(state, currentCenter, targetCenter, dt) {
		const amount = config.sparkAmount;
		const direction = normalize({ x: targetCenter.x - currentCenter.x, y: targetCenter.y - currentCenter.y });
		const count = Math.min(3, Math.max(1, Math.round(amount * 3)));
		const base = dt / 16.7;

		for (let index = 0; index < count; index++) {
			if (Math.random() > amount) {
				continue;
			}

			const behind = 4 + Math.random() * 10;
			const jitter = 3 + Math.random() * 5;
			const x = currentCenter.x - direction.x * behind + (Math.random() - 0.5) * jitter * 2;
			const y = currentCenter.y - direction.y * behind + (Math.random() - 0.5) * jitter * 2;
			const circle = createEffectCircle(x, y, 0.8 + Math.random() * 1.6);
			circle.setAttribute('fill', withAlpha(config.glowColor || config.fallbackColor, 0.95));

			effects.push({
				kind: 'spark',
				element: circle,
				x,
				y,
				vx: (-direction.x * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5) * base,
				vy: (-direction.y * (1 + Math.random() * 2) + (Math.random() - 0.5) * 1.5) * base,
				life: 1,
			});
		}
	}

	function updateEffects(dt) {
		const timeScale = dt / 16.7;

		for (let index = effects.length - 1; index >= 0; index--) {
			const effect = effects[index];

			if (effect.kind === 'ripple') {
				// Duration: ~225ms (13.5 frames at 60fps)
				effect.life -= timeScale / 13.5;
				const progress = Math.max(0, Math.min(1, 1 - effect.life));

				// Smooth ease-out for radius expansion (startRadius 3px -> maxRadius 11px)
				const easeOut = 1 - Math.pow(1 - progress, 2.5);
				const radius = effect.startRadius + (effect.maxRadius - effect.startRadius) * easeOut;
				effect.element.setAttribute('r', radius.toFixed(2));

				// Gentle fade: brief soft entrance without bright flash, then smooth fade-out to 0
				let opacity;
				if (progress < 0.15) {
					opacity = 0.06 + (0.24 - 0.06) * (progress / 0.15);
				} else {
					opacity = 0.24 * Math.pow(1 - (progress - 0.15) / 0.85, 1.4);
				}
				effect.element.setAttribute('opacity', opacity.toFixed(3));

				if (effect.life <= 0) {
					effect.element.remove();
					effects.splice(index, 1);
				}
				continue;
			}

			effect.life -= timeScale / (effect.kind === 'spark' ? 34 : 28);

			if (effect.kind === 'spark') {
				effect.x += effect.vx;
				effect.y += effect.vy;
				effect.vx *= 0.94;
				effect.vy *= 0.94;
				effect.element.setAttribute('cx', effect.x.toFixed(2));
				effect.element.setAttribute('cy', effect.y.toFixed(2));
			} else {
				effect.radius += effect.speed * timeScale;
				effect.element.setAttribute('r', effect.radius.toFixed(2));
			}

			const opacity = clampValue(effect.life, 0, 1) * (effect.kind === 'spark' ? 0.95 : 0.85);
			effect.element.setAttribute('opacity', String(opacity));

			if (effect.life <= 0) {
				effect.element.remove();
				effects.splice(index, 1);
			}
		}
	}

	function isVisible(element) {
		const rect = element.getBoundingClientRect();

		return rect.width > 0 && rect.height > 0;
	}

	function isInsideViewport(rect) {
		const margin = 1;

		return rect.bottom >= -margin && rect.right >= -margin && rect.top <= window.innerHeight + margin && rect.left <= window.innerWidth + margin;
	}

	function isSettled(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);

		if (Math.hypot(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y) >= 0.5) {
			return false;
		}

		return currentPoints.every((point, index) => {
			const target = targetPoints[index];

			return Math.hypot(target.x - point.x, target.y - point.y) < 0.5;
		});
	}

	function clampJumpDistance(currentPoints, targetPoints) {
		const maxDistance = config.maxJumpAnimationDistance;

		if (!maxDistance || maxDistance <= 0 || currentPoints.length !== 4) {
			return currentPoints;
		}

		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const jumpDistance = Math.hypot(targetCenter.x - currentCenter.x, targetCenter.y - currentCenter.y);

		if (jumpDistance <= maxDistance) {
			return currentPoints;
		}

		const scale = maxDistance / jumpDistance;

		return currentPoints.map((point, index) => {
			const target = targetPoints[index];

			return {
				x: target.x + (point.x - target.x) * scale,
				y: target.y + (point.y - target.y) * scale,
			};
		});
	}

	function getBaseSpeed(distance) {
		return clampValue(config.midSpeed + Math.min(0.16, distance / 900), 0.01, 1);
	}

	function getMaxCornerStep(state, baseSpeed) {
		const maxSideLag = clampValue(Math.max(state.width, state.height, 8) * 1.5, 8, 48);

		return maxSideLag * baseSpeed;
	}

	function hideCursorState(state) {
		state.missedFrames++;
		state.trail = [];
		state.trailFade = 0;
		state.lastTrailCenter = null;
		state.shape.setAttribute('visibility', 'hidden');
		state.shape.style.filter = 'none';

		for (const trailPath of state.trailPaths) {
			trailPath.setAttribute('visibility', 'hidden');
		}
	}

	function findNearestStartedState(targetPoints, seen) {
		let nearest = null;
		let nearestDistance = Number.POSITIVE_INFINITY;
		const targetCenter = getCenter(targetPoints);

		for (const state of states) {
			if (!state.started || state.points.length !== 4 || state.seen === 0 || seen - state.seen > 1) {
				continue;
			}

			const center = getCenter(state.points);
			const distance = Math.hypot(targetCenter.x - center.x, targetCenter.y - center.y);

			if (distance < nearestDistance) {
				nearest = state;
				nearestDistance = distance;
			}
		}

		return nearest;
	}

	function clonePoints(points) {
		return points.map((point) => ({ x: point.x, y: point.y }));
	}

	function readCursorVisual(cursor) {
		const style = getComputedStyle(cursor);
		const nativeBackgroundColor = style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
			? style.backgroundColor
			: config.fallbackColor;
		const backgroundColor = config.cursorColor || nativeBackgroundColor;

		return {
			opacity: Number.parseFloat(style.opacity || '1'),
			visibility: style.visibility,
			backgroundColor,
			border: style.border,
			borderColor: style.borderColor,
			borderRadius: style.borderRadius,
			outline: style.outline,
			boxShadow: style.boxShadow && style.boxShadow !== 'none' ? style.boxShadow : '0 0 10px ' + backgroundColor,
		};
	}

	function getTargetPoints(state) {
		const x = state.targetX;
		const y = state.targetY;
		const width = Math.max(1, state.width);
		const height = Math.max(1, state.height);

		return getBoxPoints(x, y, width, height);
	}

	function getBoxPoints(x, y, width, height) {
		return [
			{ x, y },
			{ x: x + width, y },
			{ x: x + width, y: y + height },
			{ x, y: y + height },
		];
	}

	function getCornerSpeeds(currentPoints, targetPoints) {
		const currentCenter = getCenter(currentPoints);
		const targetCenter = getCenter(targetPoints);
		const dx = targetCenter.x - currentCenter.x;
		const dy = targetCenter.y - currentCenter.y;
		const distance = Math.hypot(dx, dy);

		if (distance < 0.01) {
			return currentPoints.map(() => config.midSpeed);
		}

		const direction = {
			x: dx / distance,
			y: dy / distance,
		};
		const tangent = {
			x: -direction.y,
			y: direction.x,
		};
		const twistScale = Math.min(1, distance / 30);
		const distanceBoost = Math.min(0.16, distance / 900);

		return currentPoints.map((point) => {
			const cornerVector = getCornerVector(point, currentCenter);
			const diagonalLead = dot(cornerVector, direction);
			const axisLead = getAxisLead(cornerVector, direction);
			const lead = clampValue(diagonalLead * (1 - config.axisBias) + axisLead * config.axisBias, -1, 1);
			const twist = -dot(cornerVector, tangent) * config.twistBoost * 0.45 * twistScale;
			const directionalSpeed = lead >= 0
				? config.midSpeed + (config.fastSpeed - config.midSpeed) * lead
				: config.midSpeed + (config.slowSpeed - config.midSpeed) * -lead;

			return clampValue(directionalSpeed + twist + distanceBoost, 0.01, 1);
		});
	}

	function getCornerVector(point, center) {
		return normalize({
			x: Math.sign(point.x - center.x),
			y: Math.sign(point.y - center.y),
		});
	}

	function getAxisLead(cornerVector, direction) {
		const horizontalWeight = Math.abs(direction.x);
		const verticalWeight = Math.abs(direction.y);
		const total = horizontalWeight + verticalWeight || 1;
		const horizontalLead = horizontalWeight === 0 ? 0 : Math.sign(cornerVector.x) * Math.sign(direction.x) * horizontalWeight;
		const verticalLead = verticalWeight === 0 ? 0 : Math.sign(cornerVector.y) * Math.sign(direction.y) * verticalWeight;

		return (horizontalLead + verticalLead) / total;
	}

	function keepSimpleQuad(nextPoints, currentPoints, targetPoints) {
		if (isSimpleConvexQuad(nextPoints)) {
			return nextPoints;
		}

		for (const factor of [0.9, 0.75, 0.5, 0.25, 0]) {
			const candidate = currentPoints.map((point, index) => ({
				x: targetPoints[index].x + (point.x - targetPoints[index].x) * factor,
				y: targetPoints[index].y + (point.y - targetPoints[index].y) * factor,
			}));

			if (isSimpleConvexQuad(candidate)) {
				return candidate;
			}
		}

		return targetPoints;
	}

	function isSimpleConvexQuad(points) {
		if (!points || points.length !== 4) {
			return false;
		}

		const area = Math.abs(cross(
			{ x: points[1].x - points[0].x, y: points[1].y - points[0].y },
			{ x: points[2].x - points[0].x, y: points[2].y - points[0].y }
		)) / 2;

		if (area < 0.5) {
			return false;
		}

		const signs = [];

		for (let index = 0; index < 4; index++) {
			const previous = points[index];
			const current = points[(index + 1) % 4];
			const next = points[(index + 2) % 4];
			const crossValue = cross(
				{ x: current.x - previous.x, y: current.y - previous.y },
				{ x: next.x - current.x, y: next.y - current.y }
			);

			if (Math.abs(crossValue) < 0.001) {
				continue;
			}

			signs.push(Math.sign(crossValue));
		}

		return signs.length > 0 && signs.every((sign) => sign === signs[0]);
	}

	function getCenter(points) {
		return points.reduce((sum, point) => ({
			x: sum.x + point.x / points.length,
			y: sum.y + point.y / points.length,
		}), { x: 0, y: 0 });
	}

	function normalize(vector) {
		const length = Math.hypot(vector.x, vector.y) || 1;

		return {
			x: vector.x / length,
			y: vector.y / length,
		};
	}

	function dot(left, right) {
		return left.x * right.x + left.y * right.y;
	}

	function distance(left, right) {
		return Math.hypot(right.x - left.x, right.y - left.y);
	}

	function cross(left, right) {
		return left.x * right.y - left.y * right.x;
	}

	function clampValue(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function place(state) {
		state.shape.setAttribute('visibility', 'hidden');
		return;
		const fallbackVisual = {
			opacity: 1,
			visibility: 'visible',
			backgroundColor: config.fallbackColor,
			border: '0',
			borderColor: config.fallbackColor,
			borderRadius: '0',
			outline: '0',
			boxShadow: '0 0 10px ' + config.fallbackColor,
		};
		const visual = state.visual || fallbackVisual;
		const colors = getCursorColors(state, visual);
		const radius = getShapeRadius(state, visual.borderRadius);
		const pathData = getCursorPath(state.points, state.width, state.height, radius);
		const borderWidth = getBorderWidth(visual.border);
		const opacity = Math.max(config.minAlpha, visual.opacity);
		const glowColor = colors.glow;
		const movementOpacity = Math.min(1, state.movement / 18) * config.glowOpacity * config.glowIntensity * opacity;
		const glowSize = Math.max(0, config.glowSize);
		const glowAlpha = Math.max(0, Math.min(1, movementOpacity));
		const glowFilter = config.glowEnabled && config.animationMode !== 'off' && glowAlpha > 0 && glowSize > 0
			? [
				'drop-shadow(0 0 ' + Math.max(2, glowSize * 0.45) + 'px ' + withAlpha(glowColor, glowAlpha) + ')',
				'drop-shadow(0 0 ' + glowSize + 'px ' + withAlpha(glowColor, glowAlpha * 0.72) + ')',
			].join(' ')
			: 'none';

		state.shape.setAttribute('d', pathData);
		state.shape.setAttribute('fill', applyGradient(colors.fill, state));
		state.shape.setAttribute('opacity', String(opacity));
		state.shape.setAttribute('visibility', visual.visibility);

		if (borderWidth > 0) {
			state.shape.setAttribute('stroke', visual.borderColor || colors.fill);
			state.shape.setAttribute('stroke-width', String(borderWidth));
			state.shape.setAttribute('stroke-linejoin', 'round');
		} else {
			state.shape.setAttribute('stroke', 'none');
		}

		state.shape.style.filter = glowFilter;
		state.lastVisiblePoints = clonePoints(state.points);

		renderTrail(state, visual, opacity, colors);
	}

	function getCursorColors(state, visual) {
		if (config.rainbowEnabled) {
			const hue = (Date.now() * 0.08 + state.seen * 12) % 360;
			const fill = hslToHex(hue, 90, 62);

			return {
				fill,
				glow: config.glowColor || fill,
				hue,
			};
		}

		const fill = config.cursorColor || visual.backgroundColor;

		return {
			fill,
			glow: config.glowColor || fill,
			hue: 200,
		};
	}

	function applyGradient(fill, state) {
		if (!config.gradientEnabled && !config.rainbowEnabled) {
			return fill;
		}

		const colors = config.rainbowEnabled
			? getCursorColors(state, { backgroundColor: fill })
			: { fill, hue: 0 };
		const topColor = config.rainbowEnabled ? colors.fill : lighten(fill, 0.3);
		const bottomColor = config.rainbowEnabled ? hslToHex((colors.hue + 55) % 360, 85, 55) : darken(fill, 0.3);

		overlay.topStop.setAttribute('stop-color', topColor);
		overlay.bottomStop.setAttribute('stop-color', bottomColor);

		return 'url(#jellyCursorCursorGradient)';
	}

	function renderTrail(state, visual, opacity, colors) {
		while (state.trailPaths.length < config.trailLength) {
			const trailPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			trailPath.setAttribute('fill-rule', 'nonzero');
			trailPath.setAttribute('stroke', 'none');
			overlay.svg.appendChild(trailPath);
			state.trailPaths.push(trailPath);
		}

		if (!config.trailEnabled || config.trailLength <= 0 || state.trail.length === 0 || config.animationMode === 'off') {
			for (const trailPath of state.trailPaths) {
				trailPath.setAttribute('visibility', 'hidden');
			}

			return;
		}

		for (let index = 0; index < config.trailLength; index++) {
			const trailPath = state.trailPaths[index];
			const history = state.trail[index];

			if (!history || history.length !== 4) {
				trailPath.setAttribute('visibility', 'hidden');
				continue;
			}

			const fade = 1 - index / config.trailLength;
			const scale = Math.max(0.4, fade * 0.9);
			const center = getCenter(history);
			const scaledPoints = history.map((point) => ({
				x: center.x + (point.x - center.x) * scale,
				y: center.y + (point.y - center.y) * scale,
			}));
			const scaledWidth = Math.max(1, state.width * scale);
			const scaledHeight = Math.max(1, state.height * scale);
			const trailRadius = getShapeRadius({ width: scaledWidth, height: scaledHeight }, visual.borderRadius);

			trailPath.setAttribute('d', getCursorPath(scaledPoints, scaledWidth, scaledHeight, trailRadius));
			trailPath.setAttribute('fill', config.rainbowEnabled ? hslToHex((colors.hue - index * 14 + 360) % 360, 85, 60) : colors.fill);
			trailPath.setAttribute('opacity', String(clampValue(opacity * config.trailOpacity * fade * state.trailFade, 0, 1)));
			trailPath.setAttribute('visibility', visual.visibility);
		}
	}

	function getShapeRadius(state, nativeBorderRadius) {
		if (config.shapeStyle === 'capsule') {
			return clampValue(Math.min(state.width, state.height) / 2, 0, 12);
		}

		if (config.shapeStyle === 'rounded') {
			const parsed = parseCssPixels(nativeBorderRadius) || 3;

			return clampValue(parsed, 0, Math.min(state.width, state.height) / 2, 8);
		}

		return clampValue(parseCssPixels(nativeBorderRadius) || 0, 0, 12);
	}

	function getCursorPath(points, width, height, radius) {
		if (points.length !== 4) {
			return '';
		}

		const safeRadius = clampValue(radius, 0, Math.max(0, Math.min(width, height) / 2));

		if (safeRadius <= 0) {
			return 'M ' + points.map((point) => formatPoint(point)).join(' L ') + ' Z';
		}

		const [topLeft, topRight, bottomRight, bottomLeft] = points;
		const topRadius = Math.min(safeRadius, distance(topLeft, topRight) / 2, distance(topLeft, bottomLeft) / 2);
		const rightRadius = Math.min(safeRadius, distance(topRight, topLeft) / 2, distance(topRight, bottomRight) / 2);
		const bottomRadius = Math.min(safeRadius, distance(bottomRight, topRight) / 2, distance(bottomRight, bottomLeft) / 2);
		const leftRadius = Math.min(safeRadius, distance(bottomLeft, bottomRight) / 2, distance(bottomLeft, topLeft) / 2);

		return [
			'M ' + (topLeft.x + leftRadius) + ' ' + topLeft.y,
			'L ' + (topRight.x - rightRadius) + ' ' + topRight.y,
			'Q ' + topRight.x + ' ' + topRight.y + ' ' + topRight.x + ' ' + (topRight.y + rightRadius),
			'L ' + bottomRight.x + ' ' + (bottomRight.y - bottomRadius),
			'Q ' + bottomRight.x + ' ' + bottomRight.y + ' ' + (bottomRight.x - bottomRadius) + ' ' + bottomRight.y,
			'L ' + (bottomLeft.x + leftRadius) + ' ' + bottomLeft.y,
			'Q ' + bottomLeft.x + ' ' + bottomLeft.y + ' ' + bottomLeft.x + ' ' + (bottomLeft.y - leftRadius),
			'L ' + topLeft.x + ' ' + (topLeft.y + topRadius),
			'Q ' + topLeft.x + ' ' + topLeft.y + ' ' + (topLeft.x + topRadius) + ' ' + topLeft.y,
			'Z',
		].join(' ');
	}

	function formatPoint(point) {
		return point.x.toFixed(2) + ' ' + point.y.toFixed(2);
	}

	function getBorderWidth(border) {
		const match = String(border || '0').match(/([\d.]+)px/);

		return match ? Number.parseFloat(match[1]) : 0;
	}

	function parseCssPixels(value) {
		const match = String(value || '').match(/([\d.]+)px/);

		return match ? Number.parseFloat(match[1]) : 0;
	}

	function hslToHex(hue, saturation, lightness) {
		const s = saturation / 100;
		const l = lightness / 100;
		const chroma = (1 - Math.abs(2 * l - 1)) * s;
		const section = hue / 60;
		const x = chroma * (1 - Math.abs(section % 2 - 1));
		let red = 0;
		let green = 0;
		let blue = 0;

		if (section < 1) {
			red = chroma; green = x;
		} else if (section < 2) {
			red = x; green = chroma;
		} else if (section < 3) {
			green = chroma; blue = x;
		} else if (section < 4) {
			green = x; blue = chroma;
		} else if (section < 5) {
			red = x; blue = chroma;
		} else {
			red = chroma; blue = x;
		}

		const match = l - chroma / 2;

		return '#' + [red, green, blue]
			.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
			.join('');
	}

	function lighten(color, amount) {
		return mixHex(color, '#ffffff', amount);
	}

	function darken(color, amount) {
		return mixHex(color, '#000000', amount);
	}

	function mixHex(color, target, amount) {
		const rgb = parseHexColor(color);

		if (!rgb) {
			return color;
		}

		const targetRgb = parseHexColor(target) || rgb;

		return '#' + rgb
			.map((channel, index) => Math.round(channel + (targetRgb[index] - channel) * amount))
			.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0'))
			.join('');
	}

	function parseHexColor(color) {
		if (/^#[0-9a-f]{6}$/i.test(color)) {
			return [
				Number.parseInt(color.slice(1, 3), 16),
				Number.parseInt(color.slice(3, 5), 16),
				Number.parseInt(color.slice(5, 7), 16),
			];
		}

		if (/^#[0-9a-f]{3}$/i.test(color)) {
			return [
				Number.parseInt(color[1] + color[1], 16),
				Number.parseInt(color[2] + color[2], 16),
				Number.parseInt(color[3] + color[3], 16),
			];
		}

		return null;
	}

	function withAlpha(color, alpha) {
		const safeAlpha = Math.max(0, Math.min(1, alpha));

		if (/^#[0-9a-f]{6}$/i.test(color)) {
			const value = color.slice(1);
			const red = Number.parseInt(value.slice(0, 2), 16);
			const green = Number.parseInt(value.slice(2, 4), 16);
			const blue = Number.parseInt(value.slice(4, 6), 16);

			return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + safeAlpha + ')';
		}

		if (/^#[0-9a-f]{3}$/i.test(color)) {
			const red = Number.parseInt(color[1] + color[1], 16);
			const green = Number.parseInt(color[2] + color[2], 16);
			const blue = Number.parseInt(color[3] + color[3], 16);

			return 'rgba(' + red + ', ' + green + ', ' + blue + ', ' + safeAlpha + ')';
		}

		if (color.startsWith('rgb(')) {
			return color.replace('rgb(', 'rgba(').replace(')', ', ' + safeAlpha + ')');
		}

		return color;
	}

	if (config.rippleEnabled) {
		window.addEventListener('pointerdown', function (event) {
			const target = event.target;

			if (target && target.closest && target.closest('.monaco-editor')) {
				spawnRipple(event.clientX, event.clientY);
			}
		}, true);
	}

	// On-demand animation: loop runs only while ripples are active, 0% CPU in idle
})();
