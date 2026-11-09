-- Seed Maths domains/topics using stable keys (matches frontend dropdown ids)

WITH math_subject AS (
  SELECT id AS subject_id FROM subjects WHERE name ILIKE 'Mathematics' LIMIT 1
)
INSERT INTO domains (subject_id, key, name)
SELECT ms.subject_id, d.key, d.name
FROM math_subject ms,
     (VALUES
       ('number','Number'),
       ('algebra','Algebra'),
       ('measures','Measures'),
       ('shape_space','Shape & Space'),
       ('data_handling','Data Handling')
     ) AS d(key, name)
ON CONFLICT (key) DO NOTHING;

-- Topics
WITH d AS (SELECT id, key FROM domains)
INSERT INTO topics (domain_id, key, name)
SELECT d.id, t.key, t.name
FROM d
JOIN (
  VALUES
    ('number','number_line','Number Line'),
    ('number','fractions','Fractions'),
    ('number','decimals','Decimals'),
    ('number','percentages','Percentages'),
    ('number','ratio','Ratio'),

    ('algebra','linear_equations','Linear Equations'),
    ('algebra','indices','Indices'),
    ('algebra','quadratics','Quadratic Equations'),
    ('algebra','expressions','Algebraic Expressions'),
    ('algebra','simultaneous','Simultaneous Equations'),

    ('measures','units','Units & Conversion'),
    ('measures','perimeter_area','Perimeter & Area'),
    ('measures','volume','Volume'),
    ('measures','time','Time'),

    ('shape_space','angles','Angles'),
    ('shape_space','triangles','Triangles'),
    ('shape_space','coordinates','Coordinates'),
    ('shape_space','transformations','Transformations'),

    ('data_handling','averages','Mean / Median / Mode'),
    ('data_handling','charts','Charts'),
    ('data_handling','probability','Probability'),
    ('data_handling','range','Range')
) AS t(domain_key, key, name)
  ON t.domain_key = d.key
ON CONFLICT (domain_id, key) DO NOTHING;
