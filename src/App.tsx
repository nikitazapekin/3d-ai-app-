import React, { useState, useRef, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useProgress, Html } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';

// Компонент для отображения загрузки
function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div style={{ 
        color: 'white', 
        fontSize: '14px',
        padding: '20px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        borderRadius: '8px'
      }}>
        Загрузка: {progress.toFixed(2)}%
      </div>
    </Html>
  );
}

// Компонент для отображения 3D модели
interface ModelProps {
  file: File | null;
  scale?: number;
  position?: [number, number, number];
}

function Model({ file, scale = 1, position = [0, 0, 0] }: ModelProps) {
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setModel(null);
      return;
    }

    const loadModel = async () => {
      setLoading(true);
      setError(null);

      try {
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        const objectUrl = URL.createObjectURL(file);

        let loader: any;
        
        switch (fileExtension) {
          case 'gltf':
          case 'glb':
            const gltfLoader = new GLTFLoader();
            // Добавляем DRACO loader для сжатых моделей
            const dracoLoader = new DRACOLoader();
            dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
            gltfLoader.setDRACOLoader(dracoLoader);
            loader = gltfLoader;
            break;
          
          case 'obj':
            loader = new OBJLoader();
            break;
          
          case 'fbx':
            loader = new FBXLoader();
            break;
          
          default:
            throw new Error(`Неподдерживаемый формат файла: ${fileExtension}`);
        }

        // Загружаем модель используя подход с промисами
        const loadedObject = await new Promise((resolve, reject) => {
          loader.load(
            objectUrl,
            (object: any) => {
              URL.revokeObjectURL(objectUrl); // Очищаем URL после загрузки
              resolve(object);
            },
            (xhr: ProgressEvent) => {
              console.log(`Прогресс загрузки: ${(xhr.loaded / xhr.total) * 100}%`);
            },
            (error: ErrorEvent) => {
              URL.revokeObjectURL(objectUrl);
              reject(error);
            }
          );
        });

        let loadedModel: THREE.Group;

        if (fileExtension === 'gltf' || fileExtension === 'glb') {
          loadedModel = (loadedObject as any).scene;
        } else {
          loadedModel = loadedObject as THREE.Group;
        }

        // Центрируем и масштабируем модель
        const box = new THREE.Box3().setFromObject(loadedModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        loadedModel.position.x = -center.x;
        loadedModel.position.y = -center.y;
        loadedModel.position.z = -center.z;

        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = 2 / maxDim;
        loadedModel.scale.multiplyScalar(scaleFactor * scale);

        setModel(loadedModel);

      } catch (err) {
        console.error('Ошибка загрузки модели:', err);
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        setLoading(false);
      }
    };

    loadModel();
  }, [file, scale]);

  if (loading) {
    return (
      <Html center>
        <div style={{ color: 'white' }}>Загрузка модели...</div>
      </Html>
    );
  }

  if (error) {
    return (
      <Html center>
        <div style={{ color: 'red' }}>Ошибка: {error}</div>
      </Html>
    );
  }

  if (!model) return null;

  return <primitive object={model} position={position} />;
}

// Основной компонент приложения
function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [scale, setScale] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Проверяем поддерживаемые форматы
      const extension = file.name.split('.').pop()?.toLowerCase();
      const supportedFormats = ['gltf', 'glb', 'obj', 'fbx'];
      
      if (extension && supportedFormats.includes(extension)) {
        setSelectedFile(file);
      } else {
        alert('Неподдерживаемый формат файла. Поддерживаются: .gltf, .glb, .obj, .fbx');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const extension = file.name.split('.').pop()?.toLowerCase();
      const supportedFormats = ['gltf', 'glb', 'obj', 'fbx'];
      
      if (extension && supportedFormats.includes(extension)) {
        setSelectedFile(file);
      } else {
        alert('Неподдерживаемый формат файла. Поддерживаются: .gltf, .glb, .obj, .fbx');
      }
    }
  };

  const clearModel = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Панель управления */}
      <div style={{ 
        padding: '15px', 
        backgroundColor: '#2c3e50', 
        color: 'white',
        display: 'flex',
        gap: '20px',
        alignItems: 'center',
        flexWrap: 'wrap'
      }}>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gltf,.glb,.obj,.fbx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            id="model-file"
          />
          <label htmlFor="model-file" style={{
            padding: '10px 20px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'inline-block'
          }}>
            Выбрать модель
          </label>
        </div>

        {selectedFile && (
          <button 
            onClick={clearModel}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#e74c3c', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Очистить
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label>Масштаб:</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            style={{ width: '100px' }}
          />
          <span>{scale.toFixed(1)}</span>
        </div>

        {selectedFile && (
          <span style={{ fontSize: '14px' }}>
            Файл: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
          </span>
        )}
      </div>

      {/* 3D Canvas с областью для Drag & Drop */}
      <div 
        style={{ flex: 1 }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Canvas
          camera={{ position: [5, 5, 5], fov: 75 }}
          style={{ background: '#1a1a1a' }}
        >
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={0.6} />
            <directionalLight 
              position={[10, 10, 5]} 
              intensity={1} 
              castShadow
            />
            <pointLight position={[-10, -10, -10]} intensity={0.3} />
            
            {selectedFile && (
              <Model 
                file={selectedFile} 
                scale={scale}
                position={[0, 0, 0]}
              />
            )}
            
            <OrbitControls 
              enableDamping
              dampingFactor={0.05}
              screenSpacePanning={false}
              minDistance={1}
              maxDistance={20}
            />
            <axesHelper args={[5]} />
            <gridHelper args={[10, 10]} />
          </Suspense>
        </Canvas>

        {!selectedFile && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            textAlign: 'center',
            pointerEvents: 'none'
          }}>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>
              Перетащите 3D модель сюда или выберите файл
            </div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>
              Поддерживаемые форматы: .gltf, .glb, .obj, .fbx
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
