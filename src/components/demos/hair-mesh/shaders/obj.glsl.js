// Head (obj) shaders, ported from the original demo's shaders.js.
// "pos" attribute renamed "position" for Three.js.

import { shadowChunk } from './chunks.js';

export const vsObj = /* glsl */ `
	precision highp float;

	in vec3 position;
	in vec3 nrm;
	in vec2 uvs;

	uniform mat4 mvp;
	uniform mat4 mv;
	uniform mat3 mLight;

	out vec4 pView;
	out vec3 nView;
	out vec3 pLight;
	out vec3 nLight;
	out vec2 uv;

	void main()
	{
		gl_Position = mvp * vec4(position,1);
		pView  =  mv * vec4(position,1);
		nView  = (mv * vec4(nrm,0)).xyz;
		pLight = mLight * position;
		nLight = mLight * nrm;
		uv = uvs;
	}
`;

export const fsObj = /* glsl */ `
	precision mediump float;

	uniform mediump sampler2D tex_obj;
	uniform vec3 lightDir;

	in vec4 pView;
	in vec3 nView;
	in vec3 pLight;
	in vec3 nLight;
	in vec2 uv;

	out vec4 theColor;

	` + shadowChunk + /* glsl */ `

	void main()
	{
		vec3 n = normalize(nView);
		if ( !gl_FrontFacing ) n = -n;
		float d = dot(n,lightDir);
		float tanT = sqrt(1.0 - d*d)/d;
		float directFraction;
		vec3 spread;
		vec3 vis = Shadow( spread, directFraction, pLight, 0.005*tanT + 0.0005 );
		vec3 diffuse_color = texture(tex_obj,uv).rgb;
		float diffuse = max(0.0,d);
		float specular = 0.0;
		if ( diffuse > 0.0 && diffuse_color.r > 0.0 ) {
			vec3 v = normalize( -pView.xyz / pView.w );
			vec3 h = normalize( v + lightDir );
			float s = max(0.0,dot( n, h ));
			specular = pow( s, 20.0 ) * 0.3;
		}
		vec3 color = (vis*diffuse + AMBIENT)*diffuse_color + vis*specular;
		theColor = vec4(color,1);
	}
`;

export const fsShadow = /* glsl */ `
	precision lowp float;
	out vec4 theColor;
	void main()
	{
		theColor = vec4(1,1,1,1);
	}
`;
