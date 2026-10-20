"""Build shortlisted Rev 2 sets, numerical checks, and review renders."""
from pathlib import Path
import json
import argparse
import shutil
import numpy as np
from geometry_core import *
from search import regions, metrics, centroid

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'generated';OUT.mkdir(exist_ok=True)

def build(candidate,name,xy_inset_mm=DEFAULT_XY_INSET_MM,output_dir=OUT):
    if not np.isfinite(xy_inset_mm) or xy_inset_mm<0:
        raise ValueError('xy_inset_mm must be a finite, nonnegative distance in mm')
    slopes=np.array(candidate['slopes'],float)
    coeff=np.round(candidate['coefficients'],6)
    polys=regions(slopes,coeff)
    assert polys is not None
    assert abs(sum(area(list(p)) for p in polys)-(2*DOMAIN)**2)<1e-7
    allvertices=np.vstack(polys)
    values=np.max(allvertices@slopes.T+coeff,axis=1)
    zmin=float(values.min());zmax=float(values.max())
    zscale=35/(zmax-zmin)
    state={'name':name,'coefficient':None,'pieces':[],'metrics':metrics(polys),
           'xy_inset_mm':xy_inset_mm,'neighbor_gap_mm':2*xy_inset_mm,'z_clearance_mm':0.0,
           'transform':{'xy_mm_per_unit':XY,'z_mm_per_unit':zscale,'subtract_f_min':zmin,'min_piece_thickness_mm':8,'tray_floor_mm':FLOOR},
           'slopes':slopes.astype(int).tolist(),'coefficients':coeff.tolist()}
    folder=output_dir/name;folder.mkdir(parents=True,exist_ok=True)
    volumes=[];max_error=0
    for i,(s,c,p) in enumerate(zip(slopes,coeff,polys)):
        t={'id':chr(65+i),'a':int(s[0]),'b':int(s[1]),'c':float(c)}
        max_error=max(max_error,float(np.max(np.abs(p@s+c-np.max(p@slopes.T+coeff,axis=1))))*zscale)
        q=inset([v*XY for v in p],xy_inset_mm)
        if len(q)<3 or area(q)<1e-8:
            raise ValueError(f'Inset {xy_inset_mm} mm eliminates piece {t["id"]}; use a smaller value')
        height=lambda v: FLOOR+8+zscale*(s@v/XY+c-zmin)
        mesh=prism(q,height);volumes.append(validate(mesh))
        assert min(v[2]-FLOOR for v in mesh['vertices'][len(q):])>=8-1e-7
        cent=centroid(p)*XY
        piece={'id':t['id'],'term':t,'region':p.tolist(),'center':[float(cent[0]),float(cent[1]),float(height(cent))],
               'interior':i in state['metrics']['interior'],**mesh}
        state['pieces'].append(piece)
        export=dict(mesh);export['vertices']=[[x,y,z-FLOOR] for x,y,z in mesh['vertices']]
        write_stl(folder/f"piece-{t['id']}.stl",export)
    min_idx=int(np.argmin(values))
    report={'name':name,'piece_count':9,'xy_inset_mm':xy_inset_mm,
            'nominal_neighbor_gap_mm':2*xy_inset_mm,'nominal_wall_gap_mm':xy_inset_mm,'z_clearance_mm':0.0,
            'interior_pieces':[chr(65+i) for i in state['metrics']['interior']],
            'min_width_mm':min(state['metrics']['widths_mm']),'min_ideal_edge_mm':state['metrics']['min_edge_mm'],
            'area_ratio':state['metrics']['area_ratio'],'ideal_active_plane_max_error_mm':max_error,
            'ideal_minimum_xy_mm':(allvertices[min_idx]*XY).tolist(),
            'min_printed_thickness_mm':min(v[2]-FLOOR for p in state['pieces'] for v in p['vertices'][len(p['vertices'])//2:]),
            'max_printed_assembled_height_mm':max(v[2] for p in state['pieces'] for v in p['vertices']),
            'volumes_mm3':volumes,'similar_pairs':state['metrics']['similar_pairs']}
    return state,report

def render(data):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    from matplotlib.colors import to_rgb
    def scene(ax,state,explode=False,top=False):
        ax.computed_zorder=False
        panels=[];colors=[]
        for obj in [data['tray']]+state['pieces']:
            piece='id' in obj;offset=np.zeros(3)
            if piece and explode:
                offset[:2]=np.array(obj['center'][:2])*.55
                offset[2]=26+(12 if obj.get('interior') else 0)
            v=np.array(obj['vertices'])+offset
            base=np.array(to_rgb('#b3c3bd' if piece else '#394654'))
            if top and piece and obj.get('interior'):base=np.array(to_rgb('#d6bd72'))
            for panel in obj['panels']:
                q=v[panel];n=np.cross(q[1]-q[0],q[2]-q[0]);n/=np.linalg.norm(n)
                light=.68+.32*max(0,np.dot(n,[-.3,-.4,.866]))
                if piece:panels.append(q);colors.append(base*light)
                else:ax.add_collection3d(Poly3DCollection([q],facecolors=[base*light],edgecolors='#3d4549',linewidths=.3,zorder=1))
            if piece:
                c=np.array(obj['center'])+offset
                ax.text(c[0],c[1],c[2]+1,obj['id'],ha='center',va='center',fontsize=11,color='#263636',zorder=100)
        ax.add_collection3d(Poly3DCollection(panels,facecolors=colors,edgecolors='#3d4549',linewidths=.6,zorder=2))
        lim=115 if explode else 82
        ax.set(xlim=(-lim,lim),ylim=(-lim,lim),zlim=(0,80));ax.set_box_aspect((2*lim,2*lim,80))
        ax.view_init(90 if top else 48,-63);ax.set_axis_off();ax.set_proj_type('ortho')
    fig=plt.figure(figsize=(14,7.3),facecolor='#f4f2ed')
    for i,(explode,title) in enumerate([(False,'Rev 2 · nine pieces, four inside'),(True,'Rev 2 · exploded')]):
        ax=fig.add_subplot(1,2,i+1,projection='3d',facecolor='#f4f2ed');scene(ax,data['states'][0],explode)
        ax.set_title(title,fontsize=17,color='#263636')
    fig.text(.5,.07,'Same 152 mm frame · asymmetric slopes · no flat central piece',ha='center',fontsize=13,color='#52616b')
    fig.subplots_adjust(left=0,right=1,bottom=.10,top=.9,wspace=-.05)
    fig.savefig(OUT/'rev2-render.png',dpi=160);plt.close(fig)
    fig=plt.figure(figsize=(15,6.5),facecolor='#f4f2ed')
    for i,title in enumerate(['Recommended · balanced interior','Alternative · broader center','Rev 1 · reference']):
        ax=fig.add_subplot(1,3,i+1,projection='3d',facecolor='#f4f2ed');scene(ax,data['states'][i],top=True)
        ax.set_title(title,fontsize=14,color='#263636')
    fig.text(.5,.05,'Gold identifies fully interior pieces; letters are review labels only',ha='center',fontsize=12,color='#52616b')
    fig.subplots_adjust(left=0,right=1,bottom=.10,top=.9,wspace=-.10)
    fig.savefig(OUT/'candidate-comparison.png',dpi=160);plt.close(fig)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Build final Rev 2 with configurable XY edge clearance; no Z compensation.')
    parser.add_argument('--xy-inset',type=float,default=DEFAULT_XY_INSET_MM,metavar='MM',
                        help='Inward offset per footprint edge in mm (default: 0.15); neighbor gap is twice this value.')
    args=parser.parse_args()
    if not np.isfinite(args.xy_inset) or args.xy_inset<0:parser.error('--xy-inset must be finite and nonnegative')
    search=json.loads((ROOT/'search-results.json').read_text())
    data={'tray':tray(),'states':[],'parameters':{'span_mm':SPAN,'xy_inset_mm':args.xy_inset,
          'gap_mm':2*args.xy_inset,'z_clearance_mm':0.0,'wall_mm':WALL,'floor_mm':FLOOR}}
    reports=[]
    for candidate,name in zip(search['candidates'][:2],['rev2-recommended','rev2-alternative']):
        state,report=build(candidate,name,args.xy_inset);data['states'].append(state);reports.append(report)
    reference=json.loads((ROOT/'reference-rev1.json').read_text())
    for p in reference['pieces']:p['interior']=p['id']=='E'
    reference['metrics']={'interior':[4]};reference['name']='rev1-reference';data['states'].append(reference)
    validate(data['tray']);write_stl(OUT/'tray.stl',data['tray'])
    print_folder=ROOT/'PRINT-REV2';print_folder.mkdir(exist_ok=True)
    for path in sorted((OUT/'rev2-recommended').glob('piece-*.stl')):shutil.copyfile(path,print_folder/path.name)
    shutil.copyfile(OUT/'tray.stl',print_folder/'tray.stl')
    (print_folder/'SETTINGS.txt').write_text(
        f'Final Rev 2: selected nine-piece set plus shared tray. Units: mm.\n'
        f'XY inset per piece edge: {args.xy_inset:.3f} mm\n'
        f'Nominal adjacent-piece gap: {2*args.xy_inset:.3f} mm\n'
        f'Nominal piece-to-tray clearance per side: {args.xy_inset:.3f} mm\n'
        'Z clearance: 0 mm; original top planes and flat undersides preserved.\n'
        'Printer target: 0.4 mm nozzle, 0.2 mm layers.\n'
        'Import at 100% scale. Print parts separately, flat side down.\n'
        'Do not apply additional whole-part XY shrink in the slicer.\n'
        'Physical fit is untested. First-layer compensation is separate from model clearance.\n')
    (OUT/'geometry.json').write_text(json.dumps(data,separators=(',',':')))
    (OUT/'validation.json').write_text(json.dumps(reports,indent=2))
    render(data)
    print(json.dumps([{k:v for k,v in r.items() if k not in ['volumes_mm3','similar_pairs']} for r in reports],indent=2))
