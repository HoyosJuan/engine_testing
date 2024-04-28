import * as BUI from "../engine_ui-components/packages/core/src"
import * as OBC from "../engine_components/packages/components/src"

BUI.UIManager.registerComponents()

const grid = document.querySelector<BUI.Grid>("bim-grid")!
grid.layouts = {
  main: `
    "c-toolbars-ribbon" 80px
    "c-viewports-center" 1fr
  `
}

grid.layout = "main"

const viewport3D = grid.querySelector<BUI.Viewport>("bim-viewport[name='view-3d']")!
viewport3D.remove()

const viewerA = new OBC.Components()
viewerA.uiEnabled = false

const sceneComponentA = new OBC.SimpleScene(viewerA)
sceneComponentA.setup()
viewerA.scene = sceneComponentA

const rendererComponentA = new OBC.PostproductionRenderer(viewerA, viewport3D)
viewerA.renderer = rendererComponentA

const cameraComponentA = new OBC.OrthoPerspectiveCamera(viewerA)
viewerA.camera = cameraComponentA

await viewerA.init()
viewport3D.addEventListener("resize", () => {
  rendererComponentA.resize()
  cameraComponentA.updateAspect()
})

new OBC.SimpleGrid(viewerA)

// ------

const viewport2D = grid.querySelector<BUI.Viewport>("bim-viewport[name='view-2d']")!
viewport2D.remove()

const viewerB = new OBC.Components()
viewerB.uiEnabled = false

const sceneComponentB = new OBC.SimpleScene(viewerB)
sceneComponentB.setup()
viewerB.scene = sceneComponentB

const rendererComponentB = new OBC.PostproductionRenderer(viewerB, viewport2D)
viewerB.renderer = rendererComponentB

const cameraComponentB = new OBC.OrthoPerspectiveCamera(viewerB)
viewerB.camera = cameraComponentB

await viewerB.init()
viewport2D.addEventListener("resize", () => {
  rendererComponentB.resize()
  cameraComponentB.updateAspect()
})

new OBC.SimpleGrid(viewerB)

// Tab switcher
const tabs = {
  A: viewport2D,
  B: viewport3D,
}

const [view, updateView] = BUI.UIComponent.create((state: { tabs: Record<string, HTMLElement>, tab: string }) => {
  const { tabs, tab } = state
  const element = tabs[tab]
  return BUI.html`<div style="height: 100%">${element}</div>`
}, {tabs, tab: "A"})

const switcher = BUI.UIComponent.create(() => {
  const selector = document.createElement("bim-selector-input")
  selector.style.width = "10rem"
  for (const key in tabs) {
    const option = document.createElement("bim-option")
    option.label = key
    selector.append(option)
  }
  selector.value = "A"
  selector.addEventListener("change", () => {
    updateView({tab: selector.value})
  })
  return BUI.html`
    <div style="height: 100%">
      ${selector}
      ${view}
    </div>
  `
})

const viewportsContainer = grid.getContainer("viewports", "center")
viewportsContainer.append(switcher)