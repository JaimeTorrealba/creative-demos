// Shared GLSL chunks, ported verbatim from the original demo's shaders.js.

export const randChunk = /* glsl */ `
	float Rand( int n, int seed )
	{
		n = (n<<13) ^ (n+seed);
		n = (n * (n * n * 15731 + 789221) + 1376312589) + n;
		return float(n & 0x7fffffff) / 2147483648.0;
	}
`;

export const shadowChunk = /* glsl */ `
	uniform mediump sampler2DShadow objShadMap;
	uniform mediump sampler2D hairShadMap;
	uniform float hairDensity;

	#define AMBIENT 0.1

	float bilinear( float v[4], vec2 f )
	{
		return mix( mix( v[0], v[1], f.x ), mix( v[2], v[3], f.x ), f.y );
	}

	vec3 bilinear( vec3 v[4], vec2 f )
	{
		return mix( mix( v[0], v[1], f.x ), mix( v[2], v[3], f.x ), f.y );
	}

	vec3 HairShadow( out vec3 spread, out float directF, vec3 pShad )
	{
		ivec2 size = textureSize( hairShadMap, 0 );
		vec2 t = pShad.xy * vec2(size) + 0.5;
		vec2 f = t - floor(t);
		vec2 s = 0.5 / vec2(size);

		vec2 tcp[4];
		tcp[0] = pShad.xy + vec2( -s.x, -s.y );
		tcp[1] = pShad.xy + vec2(  s.x, -s.y );
		tcp[2] = pShad.xy + vec2( -s.x,  s.y );
		tcp[3] = pShad.xy + vec2(  s.x,  s.y );

		const float coverage = 0.05;
		const vec3 a_f = vec3( 0.507475266, 0.465571405, 0.394347166 );
		const vec3 w_f = vec3( 0.028135575, 0.027669785, 0.027669785 );
		float dir[4];
		vec3 spr[4], t_d[4];
		for ( int i=0; i<4; ++i ) {
			float z = texture(hairShadMap, tcp[i]).r;
			float h = max( 0.0, pShad.z - z );
			float n = h * hairDensity;
			dir[i] = pow( 1.0 - coverage, n );
			t_d[i] = pow( 1.0 - coverage*(1.0 - a_f), vec3(n,n,n) );
			spr[i] = n * coverage * w_f;
		}

		directF = bilinear( dir, f );
		spread  = bilinear( spr, f );
		return    bilinear( t_d, f );
	}

	vec3 Shadow( out vec3 spread, out float directF, vec3 pLight, float bias )
	{
		vec3 pShad = pLight * 0.5 + 0.5;
		pShad.z -= bias;
		float visObj = texture(objShadMap, pShad);
		vec3 trans_direct = HairShadow( spread, directF, pShad );
		directF *= visObj;
		return trans_direct * visObj;
	}
`;

export const hairShadingChunk = shadowChunk + randChunk + /* glsl */ `
	uniform highp sampler2D N_TT_R;
	uniform highp sampler2D N_TRT;
	uniform highp sampler2D N_TT_R_GI;
	uniform highp sampler2D N_TRT_GI;
	uniform highp sampler3D GI;
	uniform highp sampler2D M_GI;

	#define PI 3.1415926535897932384626433832795f
	#define ONE_OVER_PI      (1.0f / PI)
	#define ONE_OVER_PI_HALF (2.0f / PI)
	#define DEG2RAD(x) ((x) / 180.0f * PI)
	#define R_SHIFT      DEG2RAD(-5.0)
	#define TT_SHIFT     (-R_SHIFT*0.5f)
	#define TRT_SHIFT    (-R_SHIFT*1.5f)
	#define R_DEV        DEG2RAD(10.0)
	#define TT_DEV       DEG2RAD(10.0)
	#define TRT_DEV      DEG2RAD(18.0)
	#define ECCEN_SHIFT  DEG2RAD(25.0)

	#define SCALE_N_R      0.25
	#define SCALE_N_TT     0.5
	#define SCALE_N_TRT    0.25
	#define SCALE_N_R_GI   0.0625
	#define SCALE_N_TT_GI  0.66666666666666666666666666666667
	#define SCALE_N_TRT_GI 0.03703703703703703703703703703704
	#define SCALE_M_GI_R   2.6315789473684210526315789473684
	#define SCALE_M_GI_TT  2.2222222222222222222222222222222
	#define SCALE_M_GI_TRT 1.5151515151515151515151515151515
	#define SCALE_GI       0.05

	#define DENSITY 0.7f
	#define REAL_INTENSITY 5.0

	vec3 ShadeHair( vec3 pLight, vec3 tangent, vec3 w_o, int instanceID )
	{
		float directFraction;
		vec3 spread;
		vec3 trans_direct = Shadow( spread, directFraction, pLight, 0.0 );
		vec3 trans = trans_direct - directFraction;

		vec3 w_i = lightDir;

		// theta
		float sinTheta_i = dot(w_i,tangent);
		float theta_i    = asin( sinTheta_i );
		float sinTheta_o = dot(w_o,tangent);
		float theta_o    = asin( sinTheta_o );
		float theta_h    = theta_o + theta_i;
		float theta      = 0.5f * abs( theta_o - theta_i );

		// for multiple scattering texture lookups
		float ix_theta_h = theta_h * ONE_OVER_PI * 0.5f + 0.5f;
		float ix_theta   = theta   * ONE_OVER_PI_HALF;
		vec3  ix_spread  = sqrt(spread) * ONE_OVER_PI*0.5f;

		// phi
		vec3  azL     = normalize( w_i - sinTheta_i * tangent );
		vec3  azV     = normalize( w_o - sinTheta_o * tangent );
		float cosPhiH = dot( azL, azV );
		float phiH    = acos( cosPhiH );

		// Factor for non-circular fibers
		float randVal = Rand( instanceID, 3 );
		float phi_shift = ECCEN_SHIFT*(randVal-0.5f);
		if ( dot(tangent,cross(azL,azV)) < 0.0 ) phi_shift = - phi_shift;
		float phiTRT = abs( phiH + phi_shift );
		if ( phiTRT > 2.0f*PI ) phiTRT -= 2.0f*PI;
		if ( phiTRT > PI ) phiTRT = 2.0f*PI - phiTRT;

		//////////////////////////////////////////////////////////////////////////
		// Direct Illumination
		//////////////////////////////////////////////////////////////////////////

		// N for direct
		vec2 index  = vec2( phiH * ONE_OVER_PI, ix_theta );
		vec2 index2 = vec2( phiTRT * ONE_OVER_PI, index.y );

		vec4  NTTR = texture( N_TT_R, index );
		float NR   = SCALE_N_R   * NTTR.a;
		vec3  NTT  = SCALE_N_TT  * NTTR.rgb;
		vec3  NTRT = SCALE_N_TRT * texture( N_TRT, index2 ).rgb;

		// M for direct
		float thetaR = theta_h - R_SHIFT;
		float MR = exp(-0.5f*thetaR*thetaR/(R_DEV*R_DEV)) / (sqrt(2.0f*PI)*R_DEV);

		float thetaTT = theta_h - TT_SHIFT;
		float MTT = exp(-0.5f*thetaTT*thetaTT/(TT_DEV*TT_DEV)) / (sqrt(2.0f*PI)*TT_DEV);

		float thetaTRT = theta_h - TRT_SHIFT;
		float MTRT = exp(-0.5f*thetaTRT*thetaTRT/(TRT_DEV*TRT_DEV)) / (sqrt(2.0f*PI)*TRT_DEV);

		vec3 color = MR*NR + MTT*NTT + MTRT*NTRT;

		//////////////////////////////////////////////////////////////////////////
		// Local Scattering
		//////////////////////////////////////////////////////////////////////////

		vec3 gi;
		gi.r = DENSITY * texture( GI, vec3( ix_spread.r, ix_theta_h, ix_theta ) ).r;
		gi.g = DENSITY * texture( GI, vec3( ix_spread.g, ix_theta_h, ix_theta ) ).g;
		gi.b = DENSITY * texture( GI, vec3( ix_spread.b, ix_theta_h, ix_theta ) ).b;

		color += gi;

		color *= directFraction;

		//////////////////////////////////////////////////////////////////////////
		// Global Scattering
		//////////////////////////////////////////////////////////////////////////

		// N for indirect
		vec4  nttr_gi = texture( N_TT_R_GI, index );
		float nr_gi   = nttr_gi.a;
		vec3  ntt_gi  = nttr_gi.rgb;
		vec3  ntrt_gi = texture( N_TRT_GI, index2 ).rgb;

		vec3 MGIr = texture( M_GI, vec2(ix_spread.r,ix_theta_h) ).xyz;
		vec3 MGIg = texture( M_GI, vec2(ix_spread.g,ix_theta_h) ).xyz;
		vec3 MGIb = texture( M_GI, vec2(ix_spread.b,ix_theta_h) ).xyz;
		vec3 mr_gi   = vec3( MGIr.x, MGIg.x, MGIb.x );
		vec3 mtt_gi  = vec3( MGIr.y, MGIg.y, MGIb.y );
		vec3 mtrt_gi = vec3( MGIr.z, MGIg.z, MGIb.z );

		vec3 f_indir = trans*DENSITY * ( gi + mr_gi*nr_gi + mtt_gi*ntt_gi + mtrt_gi*ntrt_gi );	// N components already divided by PI
		color += f_indir;

		//////////////////////////////////////////////////////////////////////////

		color += gi * AMBIENT;
		color *= REAL_INTENSITY;

		// gamma correction
		color = sqrt(color);

		return color;
	}
`;
