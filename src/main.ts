import * as OBC from "../../engine_components/packages/components/src"
import * as BUI from "../../engine_ui-components/packages/core/src"
import * as CUI from "../../engine_ui-components/packages/obc/src"
import * as TUI from "../../engine_ui-components/packages/three/src"
import * as THREE from "three"

const viewer = new OBC.Components()
// viewer.uiEnabled = false

const sceneComponent = new OBC.SimpleScene(viewer)
sceneComponent.setup()
viewer.scene = sceneComponent

const viewport = document.getElementById("viewer") as BUI.Viewport
const rendererComponent = new OBC.PostproductionRenderer(viewer, viewport)
viewer.renderer = rendererComponent

const cameraComponent = new OBC.OrthoPerspectiveCamera(viewer)
viewer.camera = cameraComponent

const raycaster = new OBC.SimpleRaycaster(viewer)
viewer.raycaster = raycaster

await viewer.init()
const obcStyles = document.head.querySelector("style[id='openbim-components']")
obcStyles?.remove()
const { postproduction } = rendererComponent
postproduction.enabled = true

viewport.addEventListener("resize", () => {
  rendererComponent.resize()
  cameraComponent.updateAspect()
})

if (postproduction.enabled) {
  const grid = new OBC.SimpleGrid(viewer, new THREE.Color(0x555555));
  postproduction.customEffects.excludedMeshes.push(grid.get());
} else {
  // @ts-ignore
  const grid = new OBC.SimpleGrid(viewer);
}

const culler = new OBC.ScreenCuller(viewer)
await culler.setup()
culler.elements.threshold = 1

cameraComponent.controls.addEventListener("rest", () => {
  culler.elements.needsUpdate = true
})

const fragmentsManager = new OBC.FragmentManager(viewer);
const propsProcessor = new OBC.IfcPropertiesProcessor(viewer)
const propsWindow = propsProcessor.uiElement.get("propertiesWindow")
// propsWindow.visible = true
viewer.ui.add(propsWindow)
fragmentsManager.onFragmentsLoaded.add(async (model) => {
  // const localProps = await (await fetch(`${ifcStreamer.url}/small-props.json`)).json()
  // model.setLocalProperties(localProps)
  // await propsProcessor.process(model)
  // propsProcessor.renderProperties(model, 56617)
})

const ifcLoader = new OBC.FragmentIfcLoader(viewer)
await ifcLoader.setup()

ifcLoader.onIfcLoaded.add((model) => {
  // for (const item of model.items) {
  //   culler.elements.add(item.mesh)
  // }
  // culler.elements.needsUpdate = true
})

function downloadFile(name: string, ...bits: BlobPart[]) {
  const file = new File(bits, name)
  const anchor = document.createElement("a")
  const url = URL.createObjectURL(file)
  anchor.href = url
  anchor.download = file.name
  anchor.click()
  URL.revokeObjectURL(url)
}

async function downloadFilesSequentially(fileList: { name: string, bits: BlobPart[] }[]) {
  for (const { name, bits } of fileList) {
    downloadFile(name, ...bits);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// IFC conversion to streaming

const wasmSettings = {
  path: "https://unpkg.com/web-ifc@0.0.53/",
  absolute: true
}

// Properties

const streamConverterProperties = new OBC.FragmentPropsStreamConverter(viewer);

streamConverterProperties.settings.wasm = wasmSettings

let propertyFiles: { name: string, bits: BlobPart[] }[] = []

let propertiesData: {
  types: Record<string, number[]>
  ids: Record<string, number>
  indexesFile?: string
} = { types: {}, ids: {} }

let propertyFilesCount = 1

streamConverterProperties.onPropertiesStreamed.add((props) => {
  const { type, data } = props
  if (!(type in propertiesData.types))
    propertiesData.types[type] = []
  propertiesData.types[type].push(propertyFilesCount)
  for (const expressID in data) {
    if (!(expressID in propertiesData.ids))
      propertiesData.ids[expressID] = propertyFilesCount
  }
  propertyFiles.push({ name: `small.ifc-properties-${propertyFilesCount}`, bits: [JSON.stringify(data)] })
  propertyFilesCount++
})

streamConverterProperties.onIndicesStreamed.add((props) => {
  propertyFiles.push({
    name: "small.ifc-processed-properties-indexes",
    bits: [JSON.stringify(props)]
  })
})

streamConverterProperties.onProgress.add((progress) => {
  if (progress !== 1) return;
  setTimeout(async () => {
    propertiesData.indexesFile = "small.ifc-processed-properties-indexes"
    propertyFiles.push({
      name: "small.ifc-processed-properties.json",
      bits: [JSON.stringify(propertiesData)]
    })
    await downloadFilesSequentially(propertyFiles)
    propertiesData = {types: {}, ids: {}}
    propertyFiles = []
    propertyFilesCount = 1
  })
})

// Geometries

const streamConverterGeometry = new OBC.FragmentIfcStreamConverter(viewer)

streamConverterGeometry.settings.wasm = wasmSettings
streamConverterGeometry.settings.minGeometrySize = 20;
streamConverterGeometry.settings.minAssetsSize = 1000;

let geometryFiles: { name: string, bits: BlobPart[] }[] = []

let geometriesData: OBC.StreamedGeometries = {}
let geometryFilesCount = 1

streamConverterGeometry.onGeometryStreamed.add((geometry) => {
  const { buffer, data } = geometry
  const bufferFileName = `small.ifc-processed-geometries-${geometryFilesCount}`
  for (const expressID in data) {
    const value = data[expressID]
    value.geometryFile = bufferFileName
    geometriesData[expressID] = value
  }
  geometryFiles.push({name: bufferFileName, bits: [buffer]})
  geometryFilesCount++
});

let assetsData: OBC.StreamedAsset[] = []

streamConverterGeometry.onAssetStreamed.add((assets) => {
  assetsData = [...assetsData, ...assets]
});

streamConverterGeometry.onIfcLoaded.add((groupBuffer) => {
  geometryFiles.push({name: "small.ifc-processed-global", bits: [groupBuffer]})
})

streamConverterGeometry.onProgress.add((progress) => {
  if (progress !== 1) return
  setTimeout(async () => {
    const processedData = {
      geometries: geometriesData,
      assets: assetsData,
      globalDataFileId: "small.ifc-processed-global"
    }
    geometryFiles.push({ name: "small.ifc-processed.json", bits: [JSON.stringify(processedData)] })
    await downloadFilesSequentially(geometryFiles)
    assetsData = []
    geometriesData = {}
    geometryFiles = []
    geometryFilesCount = 1
  })
})

// Streaming

const ifcStreamer = new OBC.FragmentStreamLoader(viewer)
ifcStreamer.url = "../resources/structure-a/"
ifcStreamer.useCache = false
ifcStreamer.culler.threshold = 1;
ifcStreamer.culler.maxHiddenTime = 100;
ifcStreamer.culler.maxLostTime = 40000;

cameraComponent.controls.addEventListener("rest", () => {
  ifcStreamer.culler.needsUpdate = true;
});

async function loadModel(geometryURL: string, propertiesURL?: string) {
  const rawGeometryData = await fetch(geometryURL);
  const geometryData = await rawGeometryData.json();
  let propertiesData;
  if (propertiesURL) {
    const rawPropertiesData = await fetch(propertiesURL);
    propertiesData = await rawPropertiesData.json();
  }
  ifcStreamer.load(geometryData, true, propertiesData);
}

// ifcStreamer.culler.renderDebugFrame = false;
// const debugFrame = ifcStreamer.culler.get().domElement;
// viewport.appendChild(debugFrame);
// debugFrame.style.position = 'absolute';
// debugFrame.style.left = '0';
// debugFrame.style.bottom = '0';

// openbim-components UI

BUI.UIManager.registerComponents()

const appGrid = document.getElementById("app") as BUI.Grid
appGrid.layouts = {
  main: `
    "c-toolbars-ribbon c-toolbars-ribbon" auto
    "c-panels-left viewport" 1fr
    "c-panels-left viewport" 1fr
    / auto 1fr
  `
}

appGrid.layout = "main"

const importToolbar = BUI.UIComponent.create<BUI.Toolbar>(() => {
  // @ts-ignore
  const loadIfcBtn = CUI.buttons.loadIfc({ loader: ifcLoader })
  loadIfcBtn.vertical = true

  const onLoadTilesClick = () => {
    loadModel(
      `${ifcStreamer.url}small.ifc-processed.json`,
      // `${ifcStreamLoader.url}small.ifc-processed-properties.json`
    )
  }

  return BUI.html`
    <bim-toolbar label="Import" active>
      <bim-toolbar-section label="OpenBIM">
        ${loadIfcBtn}
        <bim-button label="BCF" icon="material-symbols:task" vertical></bim-button>
      </bim-toolbar-section>
      <bim-toolbar-section label="BIM Tiles">
        <bim-button @click=${onLoadTilesClick} label="Load" icon="lets-icons:load-circle" vertical></bim-button>
      </bim-toolbar-section>
    </bim-toolbar>
  `
})

const manageToolbar = BUI.UIComponent.create(() => {
  const onConvertClick = () => {
    const fileOpener = document.createElement("input");
    fileOpener.type = "file";
    fileOpener.accept = ".ifc";
    
    fileOpener.onchange = async () => {
      if (fileOpener.files === null || fileOpener.files.length === 0) return;
      const file = fileOpener.files[0];
      const ifcBuffer = await file.arrayBuffer();
      const ifcIntArray = new Uint8Array(ifcBuffer);
      const group = await ifcLoader.load(ifcIntArray)
      const propsJSON = JSON.stringify(group.getLocalProperties())
      downloadFile("small-props.json", propsJSON)
      await fragmentsManager.disposeGroup(group)
      await streamConverterGeometry.streamFromBuffer(ifcIntArray);
      // await streamConverterProperties.streamFromBuffer(ifcIntArray);
      fileOpener.remove();
    };

    fileOpener.click();
  }

  const onClearCacheClick = () => {
    ifcStreamer.clearCache()
  }

  return BUI.html`
    <bim-toolbar label="Manage">
      <bim-toolbar-section label="BIM Tiles">
        <bim-button @click=${onConvertClick} label="Convert IFC" icon="simple-icons:convertio" vertical></bim-button>
        <bim-toolbar-group>
          <bim-button @click=${onClearCacheClick} label="Clear Cache" icon="icon-park-solid:clear"></bim-button>
          <bim-button label="Settings" icon="solar:settings-bold"></bim-button>
        </bim-toolbar-group>
      </bim-toolbar-section>
    </bim-toolbar>
  `
})

const ribbon = appGrid.getContainer("toolbars", "ribbon")
ribbon.append(manageToolbar, importToolbar)

const materialManager = viewer.tools.get(OBC.MaterialManager)
const [materialsList, updateMaterialsList] = TUI.sections.materialsList(materialManager.materials)

materialManager.onMaterialAdded.add(() => {
  const { materials } = materialManager
  updateMaterialsList({ materials })
})

materialManager.onMaterialRemoved.add(() => {
  const { materials } = materialManager
  updateMaterialsList({ materials })
})

const materialA = new THREE.MeshStandardMaterial({ name: "Material A", color: "red", transparent: true })
const materialB = new THREE.MeshStandardMaterial({ name: "Material B", color: "purple", metalness: 0.4 })
const materialC = new THREE.MeshStandardMaterial({ name: "Material C", color: "green" })

const materials: THREE.Material[] = [
  materialA,
  materialB,
  materialC
]

for (const material of materials) {
  materialManager.addMaterial(material.uuid, material)
}

const meshA = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20))
const meshB = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20))
meshB.position.set(0, 25, 0)
const meshC = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20))
meshC.position.set(0, 50, 0)

materialManager.addMeshes(materialA.uuid, [meshA])
materialManager.set(true, [materialA.uuid])

materialManager.addMeshes(materialB.uuid, [meshB])
materialManager.set(true, [materialB.uuid])

// sceneComponent.get().add(meshA, meshB, meshC)

// FragmentManager
const panel = BUI.UIComponent.create<BUI.Panel>(() => {
  // @ts-ignore
  const fragmentGroupsList = CUI.tables.fragmentGroupsList(fragmentsManager)
  return BUI.html`
    <bim-panel label="Panel" active>
      <bim-panel-section label="Models" collapsed>
        ${fragmentGroupsList}
      </bim-panel-section>
      <bim-panel-section label="Materials Collection" icon="mdi:texture-box">
        ${materialsList}
      </bim-panel-section>
    </bim-panel>
  `
})

appGrid.getContainer("panels", "left").append(panel)

const floatingGrid = document.getElementById("floating-grid") as BUI.Grid
console.log(floatingGrid)

floatingGrid.layouts = {
  main: `
    "c-toolbars-right c-toolbars-top c-toolbars-top" auto
    "c-toolbars-right empty empty" 1fr
    "c-toolbars-right c-toolbars-bottom c-toolbars-bottom" auto
    / auto 1fr 1fr
  `
}

floatingGrid.layout = "main"