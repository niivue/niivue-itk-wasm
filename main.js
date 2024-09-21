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
// save mesh
saveMeshBtn.onclick = function () {
  NVMeshUtilities.saveMesh(nv1.meshes[0].pts, nv1.meshes[0].tris, 'cow.mz3', false)
}
let defaults = {
  backColor: [0, 0, 0, 1],
  show3Dcrosshair: true,
  onLocationChange: handleIntensityChange
}
var nv1 = new Niivue(defaults)
nv1.attachToCanvas(gl1)

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

async function doDownsample(inFile) {
  // bigint -> number is necessary for serialization because the object is serialized to JSON
  // to be sent to the worker and the JSON does not support bigint.
  // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
  inFile.size = inFile.size.map(Number)
  console.log('doing downsampling')
  console.log(inFile)
  const downSampleResult = await downsampleBinShrink(inFile, {
    shrinkFactors: [2, 2, 2],
    webWorker: null
  })
  const downSampledImage = downSampleResult.downsampled
  // number -> bigint because encode expects Image class to have bigint size
  downSampledImage.size = downSampledImage.size.map(BigInt)
  // must incode the downsampled image to cbor to work 
  // with iwi2nii implementation
  const downNii = iwi2nii(encode(downSampledImage))
  await nv1.loadVolumes([{ url: downNii, name: 'test.nii' }])
  console.log('dims after downsample')
  console.log(nv1.volumes[0].dims)
}

async function main() {
  const niimath = new Niimath()
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
    { url: './fslmean.iwi.cbor', name: 'fslmean.iwi.cbor' },
    { url: './cow.iwm.cbor', name: 'cow.iwm.cbor' }
  ])

  // do downsample, but get ITK Image from niivue to show interoperability.
  // We get the hdr and img from the volume that was loaded from the iwi file.
  // We then convert that data back to an ITK Image and downsample it using ITK's WASM
  // outside of niivue. 
  const hdr = nv1.volumes[0].hdr
  const img = nv1.volumes[0].img

  // convert the hdr and img (basically nifti data) to an ITK Image.
  // Remember that this image data was ORIGINALLY an ITK Image that was converted to nifti
  // so it could be loaded in niivue. But let's go back to ITK Image so we can use it with ITK.
  const iwi = nii2iwi(hdr, img, false)

  // downsample the ITK Image using the ITK WASM module.
  // This function will then convert the downsampled image back to nifti format
  // so it can be loaded in niivue.
  await doDownsample(iwi)

  // just for fun, load the fslmean.iwi.cbor file and use it with niimath
  const iwiAgain = await loadBinaryFile('./fslmean.iwi.cbor')
  const iwiData = iwi2nii(iwiAgain)
  // make file from Uint8Array
  const file = new File([new Blob([iwiData])], 'fslmean.nii', { type: 'application/octet-stream' })
  // make some THICK lines since the image is so downsampled
  const lines = await niimath.image(file).dog(2, 3.2).run('fslmean.nii')
  // make File from lines Blob
  const linesFile = new File([lines], 'lines.nii', { type: 'application/octet-stream' })
  await nv1.loadFromFile(linesFile)
  nv1.setColormap(nv1.volumes[1].id, 'red')
  nv1.setOpacity(1, 0.5)

}
main()