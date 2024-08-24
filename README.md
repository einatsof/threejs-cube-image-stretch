# Three.js cube image stretcher
Tool for stretching images on the faces of 3D cubical models built with [Three.js](https://github.com/mrdoob/three.js/).  
Image stretching math is done with the help of [perspective-transform](https://github.com/jlouthan/perspective-transform).  
Since the pixel manipulation is done on the ImageData of a canvas element and not in the shader, it is possible to download the shape with all textures in a lightweight glTF 2.0 format.
  
Demo: [einatsof.github.io/cubyot](https://einatsof.github.io/cubyot)  
  
![Example](https://github.com/einatsof/cubyot/blob/main/example.png)
