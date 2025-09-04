 import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const App = () => {
  const mountRef = useRef(null);
  const [helpText, setHelpText] = useState('Нажмите и удерживайте левую кнопку мыши, чтобы начать выделение');

  useEffect(() => {
    // Инициализация сцены, камеры и рендерера
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x263238);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(2, 4, 6);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Освещение
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xb0bec5, 0.8));

    // Форма выделения (лассо)
    const selectionShape = new THREE.Line();
    selectionShape.material = new THREE.LineBasicMaterial({ 
      color: 0xffa500, // Оранжевый цвет для линии
      linewidth: 3,
      depthTest: false
    });
    selectionShape.renderOrder = 10;
    selectionShape.visible = false;
    scene.add(selectionShape);

    // Базовая сетка (TorusKnot)
    const geometry = new THREE.TorusKnotGeometry(1.5, 0.5, 500, 60);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00aaff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Создаем BVH для геометрии
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
    scene.add(mesh);

    // Оригинальные цвета вершин для восстановления
    const originalColors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      originalColors[i * 3] = 0.0;     // R
      originalColors[i * 3 + 1] = 0.67; // G (0x00aaff в нормализованном формате)
      originalColors[i * 3 + 2] = 1.0;  // B
    }

    // Добавляем атрибут цвета к геометрии
    geometry.setAttribute('color', new THREE.BufferAttribute(originalColors, 3));
    material.vertexColors = true;

    // Пол
    const gridHelper = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -2.75;
    scene.add(gridHelper);

    // Переменные состояния для выделения
    const selectionPoints = [];
    const screenPoints = [];
    let dragging = false;
    let selectionShapeNeedsUpdate = false;

    // Raycaster для преобразования координат
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Функция для получения точки пересечения на модели
    const getIntersectionPoint = (screenX, screenY) => {
      mouse.x = screenX;
      mouse.y = screenY;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(mesh);
      
      if (intersects.length > 0) {
        return {
          worldPoint: intersects[0].point,
          screenPoint: new THREE.Vector2(screenX, screenY)
        };
      }
      return null;
    };

    // Обработчики событий мыши
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      
      dragging = true;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Получаем точку пересечения на модели
      const intersection = getIntersectionPoint(x, y);
      if (intersection) {
        selectionPoints.length = 0;
        screenPoints.length = 0;
        selectionPoints.push(intersection.worldPoint);
        screenPoints.push(intersection.screenPoint);
        selectionShape.visible = true;
        setHelpText('Рисуйте область выделения. Отпустите кнопку мыши для завершения');
      }
    };

    const onMouseUp = () => {
      dragging = false;
      
      if (selectionPoints.length >= 3) {
        updateSelection();
      } else {
        selectionShape.visible = false;
      }
      setHelpText('Нажмите и удерживайте левую кнопку мыши, чтобы начать выделение');
    };

    const onMouseMove = (e) => {
      if (!dragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Получаем точку пересечения на модели
      const intersection = getIntersectionPoint(x, y);
      if (intersection) {
        selectionPoints.push(intersection.worldPoint);
        screenPoints.push(intersection.screenPoint);
        selectionShapeNeedsUpdate = true;
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // Функция для проверки, находится ли точка внутри полигона (алгоритм winding number)
    const isPointInPolygon = (point, polygon) => {
      if (polygon.length < 3) return false;
      
      let wn = 0; // winding number
      
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        const vi = polygon[i];
        const vj = polygon[j];
        
        if (vi.y <= point.y) {
          if (vj.y > point.y) {
            if (isLeft(vi, vj, point) > 0) {
              wn++;
            }
          }
        } else {
          if (vj.y <= point.y) {
            if (isLeft(vi, vj, point) < 0) {
              wn--;
            }
          }
        }
      }
      
      return wn !== 0;
    };

    // Вспомогательная функция для определения положения точки относительно отрезка
    const isLeft = (a, b, c) => {
      return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
    };

    // Функция для визуализации лучей
    const visualizeRays = () => {
      const rayGroup = new THREE.Group();
      
      // Создаем лучи из камеры через точки полигона
      for (const screenPoint of screenPoints) {
        const rayDirection = new THREE.Vector3(screenPoint.x, screenPoint.y, 0.5)
          .unproject(camera)
          .sub(camera.position)
          .normalize();
        
        const rayLength = 10;
        const rayGeometry = new THREE.BufferGeometry();
        const rayVertices = new Float32Array([
          camera.position.x, camera.position.y, camera.position.z,
          camera.position.x + rayDirection.x * rayLength,
          camera.position.y + rayDirection.y * rayLength,
          camera.position.z + rayDirection.z * rayLength
        ]);
        
        rayGeometry.setAttribute('position', new THREE.BufferAttribute(rayVertices, 3));
        const rayMaterial = new THREE.LineBasicMaterial({ 
          color: 0x00ff00, 
          opacity: 0.3, 
          transparent: true 
        });
        
        const rayLine = new THREE.Line(rayGeometry, rayMaterial);
        rayGroup.add(rayLine);
      }
      
      scene.add(rayGroup);
      
      // Удаляем через 1 секунду
      setTimeout(() => {
        scene.remove(rayGroup);
      }, 1000);
    };

    // Функция обновления выделения
    const updateSelection = () => {
      if (selectionPoints.length < 3) return;

      // Визуализируем лучи
      visualizeRays();

      // Восстанавливаем оригинальные цвета
      const colors = mesh.geometry.attributes.color.array;
      for (let i = 0; i < originalColors.length; i++) {
        colors[i] = originalColors[i];
      }

      const indices = new Set();
      const positions = mesh.geometry.attributes.position.array;

      // Проходим по всем вершинам меша
      for (let i = 0; i < positions.length; i += 3) {
        const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        
        // Преобразуем мировые координаты вершины в экранные
        const worldVertex = vertex.clone().applyMatrix4(mesh.matrixWorld);
        const screenVertex = worldVertex.clone().project(camera);
        const screenPoint = new THREE.Vector2(screenVertex.x, screenVertex.y);
        
        // Проверяем, находится ли вершина внутри полигона на экране
        if (isPointInPolygon(screenPoint, screenPoints)) {
          // Добавляем все три вершины треугольника
          const triangleIndex = Math.floor(i / 9) * 3;
          indices.add(triangleIndex);
          indices.add(triangleIndex + 1);
          indices.add(triangleIndex + 2);
        }
      }

      // Красим выделенные треугольники в красный цвет
      if (indices.size > 0) {
        const indicesArray = Array.from(indices);
        
        for (const index of indicesArray) {
          const vertexIndex = index * 3;
          colors[vertexIndex] = 1.0;     // R
          colors[vertexIndex + 1] = 0.0; // G
          colors[vertexIndex + 2] = 0.0; // B
        }
        
        mesh.geometry.attributes.color.needsUpdate = true;
        setHelpText(`Выделено треугольников: ${indicesArray.length / 3}`);
      } else {
        setHelpText('Ничего не выделено. Попробуйте снова');
      }
      
      selectionShape.visible = false;
      selectionPoints.length = 0;
      screenPoints.length = 0;
    };

    // Анимация
    const animate = () => {
      requestAnimationFrame(animate);

      // Обновляем форму выделения
      if (selectionShapeNeedsUpdate && selectionPoints.length > 0) {
        const closedPoints = [...selectionPoints];
        // Замыкаем полигон, добавляя первую точку в конец
        if (selectionPoints.length >= 3) {
          closedPoints.push(selectionPoints[0]);
        }
        
        selectionShape.geometry = new THREE.BufferGeometry();
        selectionShape.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            closedPoints.flatMap(p => [p.x, p.y, p.z]),
            3
          )
        );
        selectionShapeNeedsUpdate = false;
      }

      // Вращаем модель для наглядности
      mesh.rotation.y += 0.005;

      renderer.render(scene, camera);
    };

    animate();

    // Очистка
    return () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%', height: '100vh', cursor: 'crosshair' }} />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '300px',
        zIndex: 1000
      }}>
        <h3>Инструмент лассо для 3D модели</h3>
        <p>{helpText}</p>
      </div>
    </div>
  );
};

export default App; 
/* import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const App = () => {
  const mountRef = useRef(null);
  const [helpText, setHelpText] = useState('Нажмите и удерживайте левую кнопку мыши, чтобы начать выделение');

  useEffect(() => {
    // Инициализация сцены, камеры и рендерера
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x263238);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(2, 4, 6);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Освещение
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xb0bec5, 0.8));

    // Форма выделения (лассо)
    const selectionShape = new THREE.Line();
    selectionShape.material = new THREE.LineBasicMaterial({ 
      color: 0xffa500, // Оранжевый цвет для линии
      linewidth: 3
    });
    selectionShape.renderOrder = 1;
    selectionShape.position.z = -0.2;
    selectionShape.depthTest = false;
    selectionShape.scale.setScalar(1);
    selectionShape.visible = false;
    camera.add(selectionShape);

    // Базовая сетка (TorusKnot)
    const geometry = new THREE.TorusKnotGeometry(1.5, 0.5, 500, 60);
    const material = new THREE.MeshStandardMaterial({
      color: 0x00aaff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Создаем BVH для геометрии
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
    scene.add(mesh);

    // Оригинальные цвета вершин для восстановления
    const originalColors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      originalColors[i * 3] = 0.0;     // R
      originalColors[i * 3 + 1] = 0.67; // G (0x00aaff в нормализованном формате)
      originalColors[i * 3 + 2] = 1.0;  // B
    }

    // Добавляем атрибут цвета к геометрии
    geometry.setAttribute('color', new THREE.BufferAttribute(originalColors, 3));
    material.vertexColors = true;

    // Меши для выделения
    const highlightMesh = new THREE.Mesh();
    highlightMesh.geometry = new THREE.BufferGeometry();
    highlightMesh.material = new THREE.MeshBasicMaterial({
      color: 0xffff00, // Желтый цвет для выделения
      opacity: 0.4,
      transparent: true,
      side: THREE.DoubleSide
    });
    highlightMesh.renderOrder = 1;
    highlightMesh.visible = false;
    scene.add(highlightMesh);

    const highlightWireframeMesh = new THREE.Mesh();
    highlightWireframeMesh.geometry = highlightMesh.geometry;
    highlightWireframeMesh.material = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      opacity: 0.8,
      transparent: true,
      wireframe: true,
      depthWrite: false,
    });
    highlightWireframeMesh.renderOrder = 2;
    highlightWireframeMesh.visible = false;
    scene.add(highlightWireframeMesh);

    // Пол
    const gridHelper = new THREE.GridHelper(10, 10, 0xffffff, 0xffffff);
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    gridHelper.position.y = -2.75;
    scene.add(gridHelper);

    // Переменные состояния для выделения
    const selectionPoints = [];
    let dragging = false;
    let selectionShapeNeedsUpdate = false;

    // Raycaster для преобразования координат
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Функция для получения точки пересечения на модели
    const getIntersectionPoint = (screenX, screenY) => {
      mouse.x = screenX;
      mouse.y = screenY;
      
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(mesh);
      
      if (intersects.length > 0) {
        return intersects[0].point;
      }
      return null;
    };

    // Обработчики событий мыши
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      
      dragging = true;
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Получаем точку пересечения на модели
      const worldPoint = getIntersectionPoint(x, y);
      if (worldPoint) {
        selectionPoints.length = 0;
        selectionPoints.push(worldPoint);
        selectionShape.visible = true;
        setHelpText('Рисуйте область выделения. Отпустите кнопку мыши для завершения');
      }
    };

    const onMouseUp = () => {
      dragging = false;
      selectionShape.visible = false;
      
      if (selectionPoints.length >= 3) {
        updateSelection();
      }
      setHelpText('Нажмите и удерживайте левую кнопку мыши, чтобы начать выделение');
    };

    const onMouseMove = (e) => {
      if (!dragging) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Получаем точку пересечения на модели
      const worldPoint = getIntersectionPoint(x, y);
      if (worldPoint) {
        selectionPoints.push(worldPoint);
        selectionShapeNeedsUpdate = true;
      }
    };

    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('mousemove', onMouseMove);

    // Функция для проверки, находится ли точка внутри полигона
    const isPointInPolygon = (point, polygon) => {
      if (polygon.length < 3) return false;
      
      let inside = false;
      const x = point.x, y = point.y;
      
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > y) !== (yj > y)) &&
          (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        
        if (intersect) inside = !inside;
      }
      
      return inside;
    };

    // Функция для создания лучей из центра камеры через точки полигона
    const castRaysFromPolygon = (polygon) => {
      const rays = [];
      const rayDirections = [];
      
      // Создаем лучи из позиции камеры через каждую точку полигона
      for (const point of polygon) {
        const direction = point.clone().sub(camera.position).normalize();
        rays.push(new THREE.Ray(camera.position, direction));
        rayDirections.push(direction);
      }
      
      return { rays, rayDirections };
    };

    // Функция для визуализации лучей (отладочная)
    const visualizeRays = (rays, directions) => {
      const rayGroup = new THREE.Group();
      
      for (let i = 0; i < rays.length; i++) {
        const ray = rays[i];
        const direction = directions[i];
        
        // Создаем луч визуализации
        const rayLength = 20;
        const rayGeometry = new THREE.BufferGeometry();
        const rayVertices = new Float32Array([
          0, 0, 0,
          direction.x * rayLength, direction.y * rayLength, direction.z * rayLength
        ]);
        rayGeometry.setAttribute('position', new THREE.BufferAttribute(rayVertices, 3));
        
        const rayMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, opacity: 0.5, transparent: true });
        const rayLine = new THREE.Line(rayGeometry, rayMaterial);
        
        rayGroup.add(rayLine);
      }
      
      scene.add(rayGroup);
      
      // Удаляем через 2 секунды
      setTimeout(() => {
        scene.remove(rayGroup);
      }, 2000);
    };

    // Функция обновления выделения
    const updateSelection = () => {
      const indices = [];
      
      // Проецируем мировые точки в экранные координаты для проверки
      const screenPolygon = selectionPoints.map(point => {
        const projected = point.clone().project(camera);
        return new THREE.Vector2(projected.x, projected.y);
      });

      // Создаем и визуализируем лучи
      const { rays, rayDirections } = castRaysFromPolygon(selectionPoints);
      visualizeRays(rays, rayDirections);

      // Используем BVH для быстрого поиска пересечений
      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box, isLeaf, score, depth) => {
          // Проверяем пересечение bounding box с лассо
          const boxPoints = [
            new THREE.Vector3(box.min.x, box.min.y, box.min.z),
            new THREE.Vector3(box.max.x, box.min.y, box.min.z),
            new THREE.Vector3(box.min.x, box.max.y, box.min.z),
            new THREE.Vector3(box.max.x, box.max.y, box.min.z),
            new THREE.Vector3(box.min.x, box.min.y, box.max.z),
            new THREE.Vector3(box.max.x, box.min.y, box.max.z),
            new THREE.Vector3(box.min.x, box.max.y, box.max.z),
            new THREE.Vector3(box.max.x, box.max.y, box.max.z)
          ];

          // Проецируем точки bounding box на экран
          const screenBoxPoints = boxPoints.map(p => {
            const worldPoint = p.clone().applyMatrix4(mesh.matrixWorld);
            const projected = worldPoint.clone().project(camera);
            return new THREE.Vector2(projected.x, projected.y);
          });

          // Проверяем, находится ли хотя бы одна точка внутри полигона
          for (const point of screenBoxPoints) {
            if (isPointInPolygon(point, screenPolygon)) {
              return true;
            }
          }

          return false;
        },

        intersectsTriangle: (tri, index, contained) => {
          // Проверяем центр треугольника
          const centroid = tri.a.clone().add(tri.b).add(tri.c).multiplyScalar(1/3);
          const worldCentroid = centroid.clone().applyMatrix4(mesh.matrixWorld);
          const projected = worldCentroid.clone().project(camera);
          
          if (isPointInPolygon(new THREE.Vector2(projected.x, projected.y), screenPolygon)) {
            indices.push(index * 3, index * 3 + 1, index * 3 + 2);
          }
        }
      });

      // Обновляем меши выделения и красим треугольники в красный цвет
      if (indices.length > 0) {
        const vertices = [];
        const positions = mesh.geometry.attributes.position.array;
        const colors = mesh.geometry.attributes.color.array;
        
        // Восстанавливаем оригинальные цвета
        for (let i = 0; i < originalColors.length; i++) {
          colors[i] = originalColors[i];
        }
        
        // Красим выделенные треугольники в красный цвет
        for (const index of indices) {
          colors[index] = 1.0;     // R
          colors[index + 1] = 0.0; // G
          colors[index + 2] = 0.0; // B
          
          const i = index;
          vertices.push(
            positions[i], positions[i + 1], positions[i + 2]
          );
        }
        
        mesh.geometry.attributes.color.needsUpdate = true;
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        highlightMesh.geometry = geometry;
        highlightMesh.visible = true;
        
        highlightWireframeMesh.geometry = geometry;
        highlightWireframeMesh.visible = true;
        
        setHelpText(`Выделено треугольников: ${indices.length / 3}`);
      } else {
        highlightMesh.visible = false;
        highlightWireframeMesh.visible = false;
        setHelpText('Ничего не выделено. Попробуйте снова');
      }
    };

    // Анимация
    const animate = () => {
      requestAnimationFrame(animate);

      // Обновляем форму выделения
      if (selectionShapeNeedsUpdate && selectionPoints.length > 0) {
        const closedPoints = [...selectionPoints];
        // Замыкаем полигон, добавляя первую точку в конец
        if (selectionPoints.length >= 3) {
          closedPoints.push(selectionPoints[0]);
        }
        
        selectionShape.geometry = new THREE.BufferGeometry();
        selectionShape.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(
            closedPoints.flatMap(p => [p.x, p.y, p.z]),
            3
          )
        );
        selectionShapeNeedsUpdate = false;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Очистка
    return () => {
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('mousemove', onMouseMove);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div>
      <div ref={mountRef} style={{ width: '100%', height: '100vh', cursor: 'crosshair' }} />
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '300px',
        zIndex: 1000
      }}>
        <h3>Инструмент лассо для 3D модели</h3>
        <p>{helpText}</p>
      </div>
    </div>
  );
};

export default App;
 */
