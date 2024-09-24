import { encode } from 'cbor-x'
import {
  iwm2mesh,
  iwi2nii,
  nii2iwi,
} from "@niivue/cbor-loader"
import {
  Niivue,
  NVMeshUtilities,
} from "@niivue/niivue"
import {
  downsampleBinShrink,
} from "@itk-wasm/downsample"
import { Niimath } from "@niivue/niimath"

sliceDrop.onchange = function () {
  let st = parseInt(this.value)
  nv1.setSliceType(st)
}

function handleIntensityChange(data) {
  document.getElementById("intensity").innerHTML =
    "&nbsp;&nbsp;" + data.string
}
saveBtn.onclick = function () {
  nv1.saveImage({ filename: 'test.nii', isSaveDrawing: false, volumeByIndex: 0 })
}

let defaults = {
  backColor: [0.4, 0.6, 0.6, 1],
  show3Dcrosshair: true,
  onLocationChange: handleIntensityChange
}
var nv1 = new Niivue(defaults)
nv1.attachToCanvas(gl1)
nv1.setInterpolation(true)
const niimath = new Niimath()

async function loadBinaryFile(url) {
  try {
      const response = await fetch(url)
      if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
      }
      return await response.arrayBuffer()
  } catch (error) {
      console.error('Error loading binary file:', error)
  }
}

async function doDownsample() {
  // bigint -> number is necessary for serialization because the object is serialized to JSON
  // to be sent to the worker and the JSON does not support bigint.
  // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
  const hdr = nv1.volumes[0].hdr
  const img = nv1.volumes[0].img
  console.log(`dims before downsample ${nv1.volumes[0].dims[1]}×${nv1.volumes[0].dims[2]}×${nv1.volumes[0].dims[3]}`)
  // convert the hdr and img (basically nifti data) to an ITK Image.
  // Remember that this image data was ORIGINALLY an ITK Image that was converted to nifti
  // so it could be loaded in niivue. But let's go back to ITK Image so we can use it with ITK.
  const inFile = nii2iwi(hdr, img, false)
  inFile.size = inFile.size.map(Number)
  const downSampleResult = await downsampleBinShrink(inFile, {
    shrinkFactors: [2, 2, 2],
    webWorker: null
  })
  const downSampledImage = downSampleResult.downsampled
  // number -> bigint because encode expects Image class to have bigint size
  downSampledImage.size = downSampledImage.size.map(BigInt)
  // must encode the downsampled image to cbor to work 
  // with iwi2nii implementation
  const downNii = iwi2nii(encode(downSampledImage))
  await nv1.loadVolumes([{ url: downNii, name: 'test.nii' }])
  console.log(`dims after downsample ${nv1.volumes[0].dims[1]}×${nv1.volumes[0].dims[2]}×${nv1.volumes[0].dims[3]}`)
}

async function doLines() {
  if (nv1.volumes.length > 1)
    nv1.removeVolume(1)
  const imageIndex = 0;
  const niiBuffer = await nv1.saveImage({ volumeByIndex: imageIndex }).buffer
  const niiFile = new File([niiBuffer], 'image.nii')
  const lines = await niimath.image(niiFile).dog(2, 3.2).run('outline.nii')
  // make File from lines Blob
  const linesFile = new File([lines], 'lines.nii', { type: 'application/octet-stream' })
  await nv1.loadFromFile(linesFile)
  nv1.setColormap(nv1.volumes[1].id, 'red')
  nv1.setOpacity(1, 0.5)
}

wasmDrop.onchange = async function() {
  if (nv1.volumes.length < 1) {
    console.log('No image open to process')
    return
  }
  const val = parseInt(this.value)
  if (val !== 1)
    await doDownsample()
  if (val > 0)
    await doLines()
  wasmDrop.value = -1
}
async function main() {
  wasmDrop.value = -1
  await niimath.init()
  // loader for iwi files
  nv1.useLoader(
    iwi2nii, // loader function
    'iwi.cbor', // file extension of the file to be parsed (e.g. a file niivue does not know about)
    'nii' // file extension that the loader converts _to_ (must be a valid extension for Niivue)
  )
  // loader for iwm files
  nv1.useLoader(
    iwm2mesh, // loader function
    'iwm.cbor', // file extension of the file to be parsed (e.g. a file niivue does not know about)
    'mz3' // file extension that the loader converts _to_ (the only one supported at the moment)
  )

  await nv1.loadImages([
    // note that niivue does not know how to load these files, 
    // but the loaders we registered above will handle them and return data
    // that niivue can use
    { url: './mni152.iwi.cbor', name: 'mni152.iwi.cbor' },
    // { url: './cow186.iwm.cbor', name: 'brain.iwm.cbor', colorRGBA: [255,0,0,0] },
  ])
}
main()